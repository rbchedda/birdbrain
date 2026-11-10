-- Re-drops authenticated INSERT/UPDATE and returns MIME to JPEG-only
-- (the 20261109003000 state). Does not redeploy strip-diary-photo.

drop policy if exists "users upload to their own folder" on storage.objects;
drop policy if exists "users replace their own photos" on storage.objects;
drop policy if exists "owners upload diary photos" on storage.objects;
drop policy if exists "owners replace diary photos" on storage.objects;

update storage.buckets
   set allowed_mime_types = array['image/jpeg']
 where id in ('post-photos', 'diary-photos');
