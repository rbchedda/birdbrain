-- Crews security review fixes (PR #34):
--  * deleting a crew deletes its posts (and their comments, likes, photos) instead
--    of making them public via group_id -> null;
--  * posts.group_id is immutable after insert (no moving into a crew you're not in,
--    no moving a crew post to public);
--  * guests can't post into a crew;
--  * admins can't demote or remove other admins; an admin may only step down themselves;
--  * crew names are trimmed and 1-40 characters.
-- (Guests refused in the crew RPCs, caps, 7-day invites and last-admin succession
-- are in 20261026000100_crews_rules.)

-- ---------------------------------------------------------------------------
-- 1. Crew deletion cascades to its posts.
-- ---------------------------------------------------------------------------
-- posts.group_id stays `on delete set null` for species groups; for crews this
-- BEFORE DELETE trigger removes the posts first (comments, likes, place counts and
-- locations cascade from posts), so nothing is ever re-scoped to public.
-- Photos are removed first. Hosted
-- Supabase may forbid direct DELETE on storage.objects (storage.protect_delete),
-- so this is best-effort like delete_my_account; the posts are deleted regardless,
-- and can_read_post_photo already denies reads of photos with no post.
create function public.delete_crew_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.kind = 'crew' then
    begin
      delete from storage.objects o
       where o.bucket_id = 'post-photos'
         and o.name in (select p.photo_path from public.posts p where p.group_id = old.id and p.photo_path is not null);
    exception when others then
      raise warning 'delete_crew_content: storage objects not removed in SQL (%)', sqlerrm;
    end;
    delete from public.posts p where p.group_id = old.id;
  end if;
  return old;
end;
$$;
create trigger groups_delete_crew_content before delete on public.groups
  for each row execute function public.delete_crew_content();

-- ---------------------------------------------------------------------------
-- 2. posts.group_id is fixed at insert.
-- ---------------------------------------------------------------------------
revoke update (group_id) on public.posts from anon, authenticated;

create function public.guard_post_group() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- The only allowed change: the FK's ON DELETE SET NULL when a species group
  -- is deleted (the old group row is already gone by then). Crew posts never
  -- reach this path; delete_crew_content removes them first.
  if new.group_id is distinct from old.group_id
     and not (new.group_id is null
              and not exists (select 1 from public.groups g where g.id = old.group_id)) then
    raise exception 'a post''s group can''t change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger posts_group_immutable before update of group_id on public.posts
  for each row execute function public.guard_post_group();

-- Defence in depth: an update must still be in a scope the author can post to.
drop policy "users update their own posts" on public.posts;
create policy "users update their own posts" on public.posts
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and public.can_see_group_scope(group_id));

-- ---------------------------------------------------------------------------
-- 3. Guests can't post into a crew (they can't join one, but belt and braces).
-- ---------------------------------------------------------------------------
drop policy "users create their own posts" on public.posts;
create policy "users create their own posts" on public.posts
  for insert to authenticated with check (
    author_id = auth.uid()
    and public.can_see_group_scope(group_id)
    and (group_id is null or not public.is_crew(group_id) or not public.is_guest())
  );

-- ---------------------------------------------------------------------------
-- 4. Admins can't demote or remove other admins in a crew.
-- Server-side paths (auth.uid() null), cascades from deleting the crew, and
-- account deletion (your own rows) are unaffected.
-- ---------------------------------------------------------------------------
create function public.guard_crew_admin_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or old.role <> 'admin' or old.user_id = uid then
    return coalesce(new, old);
  end if;
  -- Crew row already gone: this is the cascade from deleting the crew.
  if not exists (select 1 from public.groups g where g.id = old.group_id and g.kind = 'crew') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'admins can''t remove other admins' using errcode = '42501';
  end if;
  if new.role <> 'admin' then
    raise exception 'admins can only step down themselves' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger group_members_admin_guard before update of role or delete on public.group_members
  for each row execute function public.guard_crew_admin_changes();

-- ---------------------------------------------------------------------------
-- 5. Crew names: trimmed, 1-40 characters. Species groups keep 3-60.
-- ---------------------------------------------------------------------------
alter table public.groups drop constraint groups_name_check;
alter table public.groups add constraint groups_name_check check (
  case when kind = 'crew'
       then name = btrim(name) and char_length(name) between 1 and 40
       else char_length(name) between 3 and 60
  end
);

-- NOTE for future place totals: there is no public place-totals function yet.
-- When one is added it must filter crew posts INSIDE the definer function
-- (`where not p.crew_only`, equivalently `group_id is null or not is_crew(group_id)`);
-- supabase/tests/crewsRules.test.mjs fails on any public function that aggregates
-- post data and isn't on its reviewed allowlist.
