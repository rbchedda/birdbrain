-- Restore direct authenticated uploads to diary-photos and post-photos.
-- INSERT and UPDATE are restricted to the owner's folder (first path segment
-- = auth.uid()). Owner DELETE and SELECT (including can_read_post_photo
-- gating on post-photos) stay unchanged.
--
-- MIME allow-list and 10 MB cap match 20261027000400_storage_limits
-- (jpeg/png/webp/heic), reversing the JPEG-only change in
-- 20261109003000_photo_function_owns_upload.
--
-- The strip-diary-photo edge function is no longer used. Delete the deployed
-- function on hosted separately; this migration does not deploy or delete it.
-- Rollback: supabase/rollbacks/20261110002000_restore_direct_photo_uploads.down.sql

drop policy if exists "users upload to their own folder" on storage.objects;
drop policy if exists "users replace their own photos" on storage.objects;
drop policy if exists "owners upload diary photos" on storage.objects;
drop policy if exists "owners replace diary photos" on storage.objects;

create policy "users upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users replace their own photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owners upload diary photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owners replace diary photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text);

update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
 where id in ('post-photos', 'diary-photos');
