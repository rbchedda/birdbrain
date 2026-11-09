-- Least-privilege login role for PGC ingest (ingest/arcgis.mjs, ingest/stocking_windows.mjs).
--
-- The role is created NOLOGIN. Do not put a password, ALTER ROLE ... LOGIN, or
-- GRANT ... TO supabase_auth_admin (or any other privileged role) in this file.
-- Enable login out of band after this migration, for example:
--   alter role ingest_writer with login password '<set-in-dashboard-or-psql>';
-- then point the ingest job's DATABASE_URL at the pooler as ingest_writer.
--
-- The security sweep called these "5 reference tables + ingest_state". The
-- ingest scripts only write four reference tables (places, counties,
-- stocking_events, stocking_properties) plus ingest_state. No other tables
-- are granted.
--
-- RLS on those tables has only SELECT policies for anon/authenticated, so
-- writes would be denied without a policy or BYPASSRLS. This migration adds
-- tight ALL policies for ingest_writer and does not grant BYPASSRLS.
--
-- assign_place_counties() stays security definer (it backfills every place
-- with a null county) and is additionally granted to ingest_writer.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ingest_writer') then
    create role ingest_writer nologin noinherit;
  end if;
end
$$;

revoke all on all tables in schema public from ingest_writer;
revoke all on all sequences in schema public from ingest_writer;
revoke all on all functions in schema public from ingest_writer;
revoke all on schema public from ingest_writer;

grant usage on schema public to ingest_writer;
grant usage on schema extensions to ingest_writer;

grant usage on type public.place_type, public.species to ingest_writer;

grant select, insert, update, delete on
  public.places,
  public.counties,
  public.stocking_events,
  public.stocking_properties,
  public.ingest_state
  to ingest_writer;

grant execute on function public.assign_place_counties() to ingest_writer;
grant execute on function public.county_at(extensions.geometry) to ingest_writer;

drop policy if exists "ingest_writer writes places" on public.places;
create policy "ingest_writer writes places"
  on public.places for all to ingest_writer
  using (true) with check (true);

drop policy if exists "ingest_writer writes counties" on public.counties;
create policy "ingest_writer writes counties"
  on public.counties for all to ingest_writer
  using (true) with check (true);

drop policy if exists "ingest_writer writes stocking_events" on public.stocking_events;
create policy "ingest_writer writes stocking_events"
  on public.stocking_events for all to ingest_writer
  using (true) with check (true);

drop policy if exists "ingest_writer writes stocking_properties" on public.stocking_properties;
create policy "ingest_writer writes stocking_properties"
  on public.stocking_properties for all to ingest_writer
  using (true) with check (true);

drop policy if exists "ingest_writer writes ingest_state" on public.ingest_state;
create policy "ingest_writer writes ingest_state"
  on public.ingest_state for all to ingest_writer
  using (true) with check (true);
