-- Security L3: anon gets SELECT only on public reference data the signed-out app reads.
-- Signed-out reads (app/src/data/supabaseBackend.ts): places, counties, stocking_events,
-- stocking_properties, place_stocking_county, stocking_county_totals, ingest_state.
-- Rollback: supabase/rollbacks/20261027000000_revoke_anon_grants.down.sql
revoke insert, update, delete, truncate, references, trigger, maintain on all tables in schema public from anon;
revoke select on
  public.accepted_terms, public.blocklist_terms, public.comments, public.crew_invites, public.diary_entries,
  public.dogs, public.group_members, public.groups, public.hunt_log_entries, public.likes,
  public.post_locations, public.post_place_counts, public.posts, public.profiles, public.reports,
  public.saved_places, public.saves, public.species_prefs, public.storage_deletion_queue, public.user_blocks
from anon;
