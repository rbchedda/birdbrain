drop function if exists public.is_test_account();

create function public.is_test_account(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid is not null and exists (select 1 from private.test_accounts t where t.user_id = uid)
$$;
revoke execute on function public.is_test_account(uuid) from public, anon;
grant execute on function public.is_test_account(uuid) to authenticated;

create or replace function public.guard_test_account_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_test_account(auth.uid()) then
    raise exception 'test accounts cannot write %', tg_table_name using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.guard_test_account_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.crew_id is not null and public.is_test_account(new.user_id) then
    raise exception 'test accounts cannot share plans' using errcode = '42501';
  end if;
  return new;
end $$;

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
