-- Audit info: age-attestation-timestamp-client-controlled.
-- Rollback: supabase/rollbacks/20261031000400_age_attestation_grants.down.sql
-- Clients may insert only user_id/min_age/method; attested_at is always server time.
revoke insert on public.age_attestations from authenticated;
grant insert (user_id, min_age, method) on public.age_attestations to authenticated;
