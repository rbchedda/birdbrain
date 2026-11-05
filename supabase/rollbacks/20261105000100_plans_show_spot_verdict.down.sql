alter table public.plans drop column if exists spot_verdict_snapshot;
alter table public.plans drop column if exists show_spot_verdict_to_crew;

revoke all on public.plans from anon, authenticated;
grant select, delete on public.plans to authenticated;
grant insert (user_id, client_id, place_id, place_name, plan_date, species, notes, reminder, crew_id),
      update (place_id, place_name, plan_date, species, notes, reminder, crew_id)
  on public.plans to authenticated;
