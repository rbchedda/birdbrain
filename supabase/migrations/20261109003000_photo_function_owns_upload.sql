-- Photo uploads go only through the strip-diary-photo edge function, which
-- authenticates the JWT, strips or rejects the image, and writes with the
-- service role. Authenticated INSERT and UPDATE on diary-photos and
-- post-photos are revoked. Owner DELETE and SELECT (including
-- can_read_post_photo gating) stay unchanged.
--
-- Buckets are empty, so allowed_mime_types can be JPEG-only with no backfill.
-- Rollback: supabase/rollbacks/20261109003000_photo_function_owns_upload.down.sql

drop policy if exists "users upload to their own folder" on storage.objects;
drop policy if exists "owners upload diary photos" on storage.objects;
drop policy if exists "owners replace diary photos" on storage.objects;

update storage.buckets
   set allowed_mime_types = array['image/jpeg']
 where id in ('post-photos', 'diary-photos');
