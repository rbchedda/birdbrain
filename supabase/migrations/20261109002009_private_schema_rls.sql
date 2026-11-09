-- Live I2: enable RLS (no policies) on private.blur_salt and
-- private.test_accounts as defense in depth. The private schema is not
-- exposed by PostgREST and clients have no USAGE. Table owners and
-- SECURITY DEFINER helpers (is_test_account, blur_point_keyed) still work
-- because FORCE ROW LEVEL SECURITY is not set.
-- Rollback: supabase/rollbacks/20261109002009_private_schema_rls.down.sql

alter table private.blur_salt enable row level security;
alter table private.test_accounts enable row level security;
