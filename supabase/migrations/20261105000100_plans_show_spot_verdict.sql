-- Spot verdict crew opt-in (per Plan). Default OFF.
-- Rollback: supabase/rollbacks/20261105000100_plans_show_spot_verdict.down.sql
-- Hosted: append /workspace/hosted-changes-needed.md; do not apply from this PR.

alter table public.plans
  add column if not exists show_spot_verdict_to_crew boolean not null default false;

comment on column public.plans.show_spot_verdict_to_crew is
  'Owner opt-in: when true, crew members on this shared Plan may see the owner''s spot verdict (hunts ended ≥12h ago; frozen at local midnight on hunt day). Default false.';

alter table public.plans
  add column if not exists spot_verdict_snapshot jsonb;

comment on column public.plans.spot_verdict_snapshot is
  'Owner-computed spot verdict JSON for crew when show_spot_verdict_to_crew is true. No hunt rows. Cleared when opt-in is off.';

-- Expand column grants so clients can read/write the flag + snapshot with existing RLS.
revoke all on public.plans from anon, authenticated;
grant select, delete on public.plans to authenticated;
grant insert (
    user_id, client_id, place_id, place_name, plan_date, species, notes, reminder, crew_id,
    show_spot_verdict_to_crew, spot_verdict_snapshot
  ),
  update (
    place_id, place_name, plan_date, species, notes, reminder, crew_id,
    show_spot_verdict_to_crew, spot_verdict_snapshot
  )
  on public.plans to authenticated;
