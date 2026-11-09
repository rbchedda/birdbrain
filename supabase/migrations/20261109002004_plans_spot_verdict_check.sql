-- Repo L5 / live L3: crew cannot see a verdict snapshot unless the owner
-- opted in, and the jsonb payload is size-capped. NOT VALID so existing
-- hosted rows are not rewritten here; check them with aggregates only
-- before VALIDATE CONSTRAINT (query is in /workspace/hosted-changes-needed.md).
-- Cap is 8192 bytes, well above the app snapshot in app/src/data/spotVerdict.ts
-- (word, short lines, a handful of dots, timestamps).
-- Rollback: supabase/rollbacks/20261109002004_plans_spot_verdict_check.down.sql

alter table public.plans
  add constraint plans_spot_verdict_snapshot_opt_in
  check (show_spot_verdict_to_crew or spot_verdict_snapshot is null) not valid;

alter table public.plans
  add constraint plans_spot_verdict_snapshot_size
  check (spot_verdict_snapshot is null or octet_length(spot_verdict_snapshot::text) <= 8192) not valid;
