-- Repo L2 / live L1: is_test_account no longer takes a uid (the previous
-- defaulted parameter let any signed-in user probe an arbitrary profile).
-- It always uses auth.uid(). Guard triggers are rewritten to the no-arg
-- form and stay in place.
-- Rollback: supabase/rollbacks/20261109002001_is_test_account_auth_uid.down.sql

drop function if exists public.is_test_account(uuid);

create function public.is_test_account() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from private.test_accounts t where t.user_id = auth.uid())
$$;

revoke execute on function public.is_test_account() from public, anon;
grant execute on function public.is_test_account() to authenticated;

create or replace function public.guard_test_account_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_test_account() then
    raise exception 'test accounts cannot write %', tg_table_name using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.guard_test_account_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.crew_id is not null and public.is_test_account() then
    raise exception 'test accounts cannot share plans' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.guard_test_account_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_test_account()
     and (new.username is distinct from old.username
          or new.display_name is distinct from old.display_name) then
    raise exception 'test accounts cannot update visible profile fields' using errcode = '42501';
  end if;
  return new;
end $$;

revoke execute on function public.guard_test_account_write(),
  public.guard_test_account_plan(),
  public.guard_test_account_profile()
  from public, anon, authenticated;
