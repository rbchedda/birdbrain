-- Gate post-photo reads on the post being visible.
--
-- Leak fixed: any signed-in user could read every object in post-photos,
-- including photos of posts still inside the delay and photos from users who
-- blocked them. Now a photo is readable by the uploader (their own folder) or
-- by anyone who can see a post whose photo_path is that object, which applies
-- the delay and blocks via can_see_post().

create function public.can_read_post_photo(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
     where p.photo_path = object_name
       -- A post can only expose a photo from its own author's folder, so
       -- pointing photo_path at someone else's upload grants nothing.
       and (storage.foldername(object_name))[1] = p.author_id::text
       and public.can_see_post(p.author_id, p.public_after)
  );
$$;

drop policy "signed-in users read post photos" on storage.objects;
create policy "read own photos or photos of visible posts" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'post-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_read_post_photo(name)
    )
  );
