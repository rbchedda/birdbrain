-- Lock post edits once a post is public.
--
-- Leak fixed: an author could publish a harmless post, wait for it to become
-- public, then edit the caption/photo/location to report live birds. Once
-- public_after has passed, clients can no longer update the post or its
-- exact location. Deleting, and hiding the location, stay allowed. Server-side triggers (counts, blur)
-- run as the owner and are unaffected.

create function public.guard_public_post_edit() returns trigger
language plpgsql set search_path = '' as $$
declare
  pa timestamptz;
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'posts' then
    pa := old.public_after;
    -- Hiding the location of a public post only removes information, so allow
    -- an update that changes nothing but location_visibility -> 'hidden'.
    if new.location_visibility = 'hidden'
       and (new.kind, new.species, new.caption, new.photo_path, new.group_id, new.hunted_on)
           is not distinct from (old.kind, old.species, old.caption, old.photo_path, old.group_id, old.hunted_on) then
      return new;
    end if;
  else
    select p.public_after into pa from public.posts p where p.id = coalesce(new.post_id, old.post_id);
  end if;
  if pa is not null and pa <= now() then
    raise exception 'post is public and can no longer be edited'
      using errcode = 'P0001', hint = 'Delete the post or add a comment instead.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger posts_lock_after_public before update on public.posts
  for each row execute function public.guard_public_post_edit();

-- Deleting an exact location is allowed (it only removes information).
create trigger post_locations_lock_after_public before insert or update on public.post_locations
  for each row execute function public.guard_public_post_edit();
