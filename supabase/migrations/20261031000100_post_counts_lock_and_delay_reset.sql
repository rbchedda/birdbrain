-- Audit lows: post_place_counts-editable-after-public, and privacy audit #12
-- (pre-public edit does not reset the delay).
-- Rollback: supabase/rollbacks/20261031000100_post_counts_lock_and_delay_reset.down.sql

-- 1. Counts on a public post are frozen like posts/post_locations. Deletes are
--    blocked too (removing counts changes what the public post says); deleting
--    the post itself still cascades, because RI actions run as the table owner.
create trigger post_place_counts_lock_after_public
  before insert or update or delete on public.post_place_counts
  for each row execute function public.guard_public_post_edit();

-- 2. Editing a post's content (or its exact location / counts) before it goes
--    public restarts the delay from the edit time, so "post harmless now, edit in
--    live birds at 11:59 PM" no longer goes public at midnight.
--    Only moves public_after forward; created_at is left alone.
create function public.reset_post_public_after() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.public_after > now()
     and (new.kind, new.species, new.caption, new.photo_path, new.group_id, new.hunted_on)
         is distinct from (old.kind, old.species, old.caption, old.photo_path, old.group_id, old.hunted_on) then
    new.public_after := greatest(old.public_after, public.public_after_for(now()));
  end if;
  return new;
end;
$$;
create trigger posts_reset_public_after_on_edit
  before update of kind, species, caption, photo_path, group_id, hunted_on on public.posts
  for each row execute function public.reset_post_public_after();

-- Child rows (exact location, counts) touch the parent post as the owner, since
-- public_after isn't in any client grant.
create function public.reset_parent_public_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.posts p
     set public_after = greatest(p.public_after, public.public_after_for(now()))
   where p.id = coalesce(new.post_id, old.post_id)
     and p.public_after > now();
  return null;
end;
$$;
revoke execute on function public.reset_post_public_after(), public.reset_parent_public_after()
  from public, anon, authenticated;
create trigger post_locations_reset_public_after after update on public.post_locations
  for each row execute function public.reset_parent_public_after();
create trigger post_place_counts_reset_public_after after update or delete on public.post_place_counts
  for each row execute function public.reset_parent_public_after();
