-- Repo L1 / live L1: extend smoke-test isolation to groups inserts and
-- profiles username/display_name updates. Test accounts can still write
-- owner-only profile fields (e.g. has_dog).
-- Rollback: supabase/rollbacks/20261109002000_smoke_guards_groups_profiles.down.sql

drop trigger if exists guard_test_account on public.groups;
create trigger guard_test_account before insert on public.groups
  for each row execute function public.guard_test_account_write();

create or replace function public.guard_test_account_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_test_account(auth.uid())
     and (new.username is distinct from old.username
          or new.display_name is distinct from old.display_name) then
    raise exception 'test accounts cannot update visible profile fields' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_test_account_profile on public.profiles;
create trigger guard_test_account_profile before update on public.profiles
  for each row execute function public.guard_test_account_profile();

revoke execute on function public.guard_test_account_profile() from public, anon, authenticated;
