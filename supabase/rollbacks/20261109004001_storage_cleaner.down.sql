-- Rollback for 20261109004001_storage_cleaner.

drop policy if exists "storage_cleaner manages queue" on public.storage_deletion_queue;

revoke all on public.storage_deletion_queue from storage_cleaner;
revoke all on all tables in schema public from storage_cleaner;
revoke all on all sequences in schema public from storage_cleaner;
revoke all on all functions in schema public from storage_cleaner;
revoke all on schema public from storage_cleaner;

drop role if exists storage_cleaner;

delete from supabase_migrations.schema_migrations where version = '20261109004001';
