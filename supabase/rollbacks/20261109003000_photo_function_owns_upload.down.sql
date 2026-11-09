-- Restore authenticated owner INSERT/UPDATE and the previous MIME allow-list.
create policy "users upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owners upload diary photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owners replace diary photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text);

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
 where id in ('post-photos', 'diary-photos');
