-- Crew photos are deleted through the Storage API, never in SQL.
--
-- A SQL `delete from storage.objects` is refused on hosted Supabase
-- (storage.protect_delete), and where it does run it only drops the metadata
-- row and leaves the file in the bucket. So the crew-delete trigger now queues
-- the paths, and ingest/storage_cleanup.mjs (service role, scheduled by
-- .github/workflows/storage-cleanup.yml) removes them via the Storage API and
-- deletes each queue row only after the API confirms.
--
-- Until the job runs the files still exist, but nobody can read them:
-- can_read_post_photo needs a post row whose photo_path is the object name, and
-- those rows are deleted by the same trigger.

create table public.storage_deletion_queue (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  path text not null,
  reason text not null,
  enqueued_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  unique (bucket_id, path)
);
create index storage_deletion_queue_pending_idx on public.storage_deletion_queue (attempts, id);

alter table public.storage_deletion_queue enable row level security;
-- No policies: clients get nothing. Only service_role (bypasses RLS) and the
-- postgres owner used by the job's direct connection can touch it.
revoke all on public.storage_deletion_queue from public, anon, authenticated;
grant select, insert, update, delete on public.storage_deletion_queue to service_role;

create or replace function public.delete_crew_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.kind = 'crew' then
    insert into public.storage_deletion_queue (bucket_id, path, reason)
    select 'post-photos', p.photo_path, 'crew deleted'
      from public.posts p
     where p.group_id = old.id and p.photo_path is not null
    on conflict (bucket_id, path) do nothing;
    delete from public.posts p where p.group_id = old.id;
  end if;
  return old;
end;
$$;
revoke execute on function public.delete_crew_content() from public, anon, authenticated;
