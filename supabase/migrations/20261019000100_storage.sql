-- Private bucket for post photos. Objects live under <user_id>/<file>.
-- Clients must strip EXIF (including GPS) before upload.
insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', false)
on conflict (id) do nothing;

create policy "signed-in users read post photos" on storage.objects
  for select to authenticated using (bucket_id = 'post-photos');

create policy "users upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete their own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);
