-- Least-privilege role for the storage-cleanup job's database connection.
-- The job still has to delete objects through the Storage API (a SQL delete
-- on storage.objects orphans the file in S3; see Supabase storage docs).
-- This role only needs to read, update, and delete queue rows.
--
-- Created NOLOGIN. Enable login and set a password out of band, not here:
--   alter role storage_cleaner with login password '<set-in-dashboard-or-psql>';
-- Point STORAGE_CLEANUP_DATABASE_URL at the pooler as storage_cleaner.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'storage_cleaner') then
    create role storage_cleaner nologin noinherit;
  end if;
end
$$;

revoke all on all tables in schema public from storage_cleaner;
revoke all on all sequences in schema public from storage_cleaner;
revoke all on all functions in schema public from storage_cleaner;
revoke all on schema public from storage_cleaner;

grant usage on schema public to storage_cleaner;
grant select, update, delete on public.storage_deletion_queue to storage_cleaner;

drop policy if exists "storage_cleaner manages queue" on public.storage_deletion_queue;
create policy "storage_cleaner manages queue"
  on public.storage_deletion_queue for all to storage_cleaner
  using (true) with check (true);
