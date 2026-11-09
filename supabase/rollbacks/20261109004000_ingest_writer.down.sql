-- Rollback for 20261109004000_ingest_writer.
-- Drop the role only after revoking grants. If a session is still connected
-- as ingest_writer, DROP ROLE will fail; disconnect those sessions first.
-- This does not drop a login password you set out of band (the role goes away).

drop policy if exists "ingest_writer writes places" on public.places;
drop policy if exists "ingest_writer writes counties" on public.counties;
drop policy if exists "ingest_writer writes stocking_events" on public.stocking_events;
drop policy if exists "ingest_writer writes stocking_properties" on public.stocking_properties;
drop policy if exists "ingest_writer writes ingest_state" on public.ingest_state;

revoke all on function public.assign_place_counties() from ingest_writer;
revoke all on function public.county_at(extensions.geometry) from ingest_writer;
revoke all on type public.place_type, public.species from ingest_writer;
revoke all on
  public.places,
  public.counties,
  public.stocking_events,
  public.stocking_properties,
  public.ingest_state
  from ingest_writer;
revoke all on all tables in schema public from ingest_writer;
revoke all on all sequences in schema public from ingest_writer;
revoke all on all functions in schema public from ingest_writer;
revoke all on schema public from ingest_writer;
revoke all on schema extensions from ingest_writer;

drop role if exists ingest_writer;

delete from supabase_migrations.schema_migrations where version = '20261109004000';
