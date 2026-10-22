-- Private crews (spec §3.6): joined by invite link or QR only, no public directory.
-- A crew is a row in public.groups with kind = 'crew'. Species groups (kind = 'species')
-- keep their existing open behaviour.
--
-- RLS: non-members see nothing about a crew (the group row, its members, its invites, its posts).
-- Only admins manage a crew (rename, invites, remove members, change roles). Nobody can make
-- themselves admin: crews are joined only through join_crew(), always as 'member'.

alter table public.groups
  add column kind text not null default 'species' check (kind in ('species', 'crew'));
alter table public.groups
  add constraint groups_crew_not_official check (kind <> 'crew' or not is_official);

-- Membership check that bypasses group_members RLS (so policies on group_members don't recurse).
create function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

create function public.is_crew(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups where id = gid and kind = 'crew');
$$;

revoke execute on function public.is_group_member(uuid), public.is_crew(uuid) from public, anon;
grant execute on function public.is_group_member(uuid), public.is_crew(uuid) to authenticated;

-- groups: crews are visible to their members only; crews are created only via create_crew().
drop policy "groups are visible to signed-in users" on public.groups;
create policy "species groups are visible; crews only to members" on public.groups
  for select to authenticated using (kind <> 'crew' or public.is_group_member(id));

drop policy "users create unofficial groups" on public.groups;
create policy "users create unofficial species groups" on public.groups
  for insert to authenticated with check (created_by = auth.uid() and not is_official and kind = 'species');

drop policy "group admins update groups" on public.groups;
create policy "group admins update groups" on public.groups
  for update to authenticated using (public.is_group_admin(id))
  with check (public.is_group_admin(id) and not is_official);

create policy "crew admins delete crews" on public.groups
  for delete to authenticated using (kind = 'crew' and public.is_group_admin(id));

-- kind can't be changed after creation (a species group can't turn into a hidden crew or back).
create function public.guard_group_kind() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'group kind cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger groups_kind_immutable before update on public.groups
  for each row execute function public.guard_group_kind();

-- group_members: you see your own rows, and co-members of groups you belong to.
drop policy "memberships are visible to signed-in users" on public.group_members;
create policy "memberships are visible to fellow members" on public.group_members
  for select to authenticated using (user_id = auth.uid() or public.is_group_member(group_id));

-- Self-join stays open for species groups only; crews are joined through join_crew().
drop policy "users join groups as members" on public.group_members;
create policy "users join species groups as members" on public.group_members
  for insert to authenticated
  with check (user_id = auth.uid() and role = 'member' and not public.is_crew(group_id));

-- Admins change roles. A member is never an admin, so can't promote themselves.
create policy "group admins change roles" on public.group_members
  for update to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- Membership rows can't move between groups or users on update.
create function public.guard_member_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.group_id is distinct from old.group_id or new.user_id is distinct from old.user_id then
    raise exception 'membership identity cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger group_members_identity before update on public.group_members
  for each row execute function public.guard_member_identity();

-- ---------------------------------------------------------------------------
-- Invites: only a hash of the token is stored; the token is returned once.
-- ---------------------------------------------------------------------------

create table public.crew_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  token_hash bytea not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index crew_invites_group_idx on public.crew_invites (group_id);
alter table public.crew_invites enable row level security;

-- Admins read and revoke their crew's invites. Inserts only via create_crew_invite().
create policy "crew admins read invites" on public.crew_invites
  for select to authenticated using (public.is_group_admin(group_id));
create policy "crew admins revoke invites" on public.crew_invites
  for update to authenticated using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "crew admins delete invites" on public.crew_invites
  for delete to authenticated using (public.is_group_admin(group_id));
revoke all on public.crew_invites from anon;
revoke insert, truncate, references, trigger on public.crew_invites from authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Create a crew; the caller becomes its admin.
create function public.create_crew(crew_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  insert into public.groups (slug, name, kind, is_official, created_by)
  values ('crew-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), btrim(crew_name), 'crew', false, uid)
  returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'admin');
  return gid;
end;
$$;

-- New invite for a crew the caller administers. Valid 1 hour to 30 days (default 7 days).
create function public.create_crew_invite(gid uuid, ttl_hours integer default 168)
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  exp timestamptz := now() + make_interval(hours => least(greatest(coalesce(ttl_hours, 168), 1), 720));
begin
  if not public.is_crew(gid) or not public.is_group_admin(gid) then
    raise exception 'only crew admins can invite' using errcode = '42501';
  end if;
  insert into public.crew_invites (group_id, token_hash, created_by, expires_at)
  values (gid, sha256(convert_to(t, 'UTF8')), auth.uid(), exp);
  return query select t, exp;
end;
$$;

-- Join by token. Always as 'member'; already a member is a no-op. Expired, revoked
-- and unknown tokens get the same error, so tokens can't be probed.
create function public.join_crew(invite_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select i.group_id into gid
    from public.crew_invites i
   where i.token_hash = sha256(convert_to(coalesce(invite_token, ''), 'UTF8'))
     and i.revoked_at is null
     and i.expires_at > now();
  if gid is null then
    raise exception 'invite is invalid or expired' using errcode = 'P0002';
  end if;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'member')
  on conflict (group_id, user_id) do nothing;
  return gid;
end;
$$;

revoke execute on function public.create_crew(text), public.create_crew_invite(uuid, integer), public.join_crew(text)
  from public, anon;
grant execute on function public.create_crew(text), public.create_crew_invite(uuid, integer), public.join_crew(text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Posts in a crew are visible to that crew's members only (on top of the delay/block/hide rules).
-- ---------------------------------------------------------------------------

create function public.can_see_group_scope(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select gid is null or not public.is_crew(gid) or public.is_group_member(gid);
$$;
revoke execute on function public.can_see_group_scope(uuid) from public, anon;
grant execute on function public.can_see_group_scope(uuid) to authenticated;

drop policy "posts are visible after the delay, unless blocked or hidden" on public.posts;
create policy "posts are visible after the delay, unless blocked, hidden or crew-only" on public.posts
  for select to authenticated using (
    public.can_see_post_row(author_id, public_after, hidden_at)
    and (author_id = auth.uid() or public.can_see_group_scope(group_id))
  );

create or replace function public.can_see_post_id(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
     where p.id = pid
       and public.can_see_post_row(p.author_id, p.public_after, p.hidden_at)
       and (p.author_id = auth.uid() or public.can_see_group_scope(p.group_id))
  );
$$;

create or replace function public.can_read_post_photo(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
     where p.photo_path = object_name
       and (storage.foldername(object_name))[1] = p.author_id::text
       and public.can_see_post_row(p.author_id, p.public_after, p.hidden_at)
       and (p.author_id = auth.uid() or public.can_see_group_scope(p.group_id))
  );
$$;

-- Only members can post into a crew.
drop policy "users create their own posts" on public.posts;
create policy "users create their own posts" on public.posts
  for insert to authenticated with check (author_id = auth.uid() and public.can_see_group_scope(group_id));
