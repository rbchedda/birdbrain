-- delete_my_account no longer deletes storage.objects in SQL. Hosted Supabase
-- refuses that (storage.protect_delete), the old code swallowed the error, and
-- where it did run it only dropped metadata rows and orphaned the files.
-- Instead every object the user owns (by owner, or under their <uid>/ folder,
-- in any bucket) is queued in public.storage_deletion_queue, in the same
-- transaction as the account delete. ingest/storage_cleanup.mjs removes the
-- files through the Storage API. The client's own Storage API cleanup before the
-- RPC (lib/storageCleanup.ts) still runs; queued paths that are already gone are fine.
--
-- Until the job runs, no other user can read the files: the own-folder policies need
-- auth.uid() = <uid> (only a not-yet-expired access token of the deleted user
-- could still match; refresh is gone with the auth.users row); post-photo reads need a
-- live post row (can_read_post_photo), and the posts cascade with the account.

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  update public.groups set created_by = null where created_by = uid;

  insert into public.storage_deletion_queue (bucket_id, path, reason)
  select o.bucket_id, o.name, 'account deleted'
    from storage.objects o
   where o.owner = uid or (storage.foldername(o.name))[1] = uid::text
  on conflict (bucket_id, path) do nothing;

  -- Cascades to profiles, posts (whose crew/photo rows go with them), diary, etc.
  -- One function call = one transaction: if this fails, the queue rows roll back too.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
