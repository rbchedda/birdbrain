-- P0.4: in-app account deletion (App Store 5.1.1(v) / Play account deletion).
--
-- public.delete_my_account() deletes the caller's auth user. Everything they
-- own hangs off profiles -> auth.users with ON DELETE CASCADE, so deleting the
-- auth user removes: profile, posts (and their exact locations, place counts,
-- likes, saves, comments and reports on them), the user's comments, likes,
-- saves, saved places, species prefs, dogs, group memberships, blocks in both
-- directions, reports they filed and reports about their profile.
-- Groups they created are kept for other members with created_by anonymized
-- (already ON DELETE SET NULL). Photos under post-photos/<uid>/ are removed.
--
-- Hosted Supabase may forbid direct DELETE on storage.objects (storage.protect_delete);
-- the client removes the photos through the Storage API first, and this
-- function's storage delete is best-effort so the account deletion still
-- succeeds there.

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Anonymize, don't delete, groups other people still use.
  update public.groups set created_by = null where created_by = uid;

  begin
    delete from storage.objects
     where bucket_id = 'post-photos' and (storage.foldername(name))[1] = uid::text;
  exception when others then
    raise warning 'delete_my_account: storage objects not removed in SQL (%); client removes them via the Storage API', sqlerrm;
  end;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
