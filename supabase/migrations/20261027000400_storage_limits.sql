-- Privacy P4: photo buckets accept images only, 10 MB max.
-- Rollback: supabase/rollbacks/20261027000400_storage_limits.down.sql
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
 where id in ('post-photos', 'diary-photos');
