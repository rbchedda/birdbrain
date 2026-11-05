-- Rollback for 20261105000200_smoke_test_isolation. Does NOT drop schema private (blur salt lives there).
do $$ declare t text; begin
  foreach t in array array['posts','comments','likes','saves','group_members','crew_invites','reports','share_links','public_share_reports'] loop
    if to_regclass('public.' || t) is not null then execute format('drop trigger if exists guard_test_account on public.%I', t); end if;
  end loop; end $$;
drop trigger if exists guard_test_account_plan on public.plans;
drop function if exists public.guard_test_account_plan();
drop function if exists public.guard_test_account_write();
drop function if exists public.is_test_account(uuid);
drop table if exists private.test_accounts;
delete from supabase_migrations.schema_migrations where version = '20261105000200';
