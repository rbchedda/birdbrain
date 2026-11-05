-- Smoke-test account isolation (weekly hosted smoke). Repo only until approved for hosted.
-- Test accounts live in private.test_accounts (private schema is not exposed by
-- PostgREST, so no client can add or remove itself). A guard trigger stops a
-- test account from writing anything another user could ever see: posts,
-- comments, likes, saves, crew membership/invites, reports, share links.
-- It can still write its own owner-only rows (hunt_log_entries, diary_entries,
-- plans with crew_id null, accepted_terms, saved_places, profiles).
-- Rollback: supabase/rollbacks/20261105000200_smoke_test_isolation.down.sql (keeps schema private: it also holds private.blur_salt).

create schema if not exists private;

create table if not exists private.test_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text not null default 'smoke',
  created_at timestamptz not null default now()
);
revoke all on private.test_accounts from public, anon, authenticated;

create or replace function public.is_test_account(uid uuid default auth.uid()) returns boolean
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

do $$
declare t text;
begin
  foreach t in array array['posts','comments','likes','saves','group_members','crew_invites','reports','share_links','public_share_reports']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists guard_test_account on public.%I', t);
      execute format('create trigger guard_test_account before insert on public.%I for each row execute function public.guard_test_account_write()', t);
    end if;
  end loop;
end $$;

-- Plans: a test account may never share a plan to a crew.
create or replace function public.guard_test_account_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.crew_id is not null and public.is_test_account(new.user_id) then
    raise exception 'test accounts cannot share plans' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_test_account_plan on public.plans;
create trigger guard_test_account_plan before insert or update on public.plans
  for each row execute function public.guard_test_account_plan();

-- Registering the account (run once, by an admin, after the auth user exists):
--   insert into private.test_accounts (user_id) select id from auth.users where email = '<BB_SMOKE_EMAIL>';

