-- Live L4 / L5: drop leftover default TRUNCATE / REFERENCES / TRIGGER (and
-- MAINTAIN) on public tables from client roles, and unexpected DML on
-- reference/service tables. Revoke EXECUTE on trigger/helper DEFINER
-- functions so they are not in the Data API. Triggers already created keep
-- firing (EXECUTE is checked at CREATE TRIGGER time).
-- Rollback: supabase/rollbacks/20261109002007_revoke_leftover_grants.down.sql

do $$
declare r record;
begin
  for r in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format(
      'revoke truncate, references, trigger, maintain on %I.%I from public, anon, authenticated',
      r.nspname, r.relname
    );
  end loop;
end $$;

revoke insert, update, delete, truncate, references, trigger, maintain
  on public.places, public.counties, public.stocking_events, public.stocking_properties,
     public.ingest_state, public.blocklist_terms, public.storage_deletion_queue,
     public.share_link_view_counts, public.share_link_abuse_logs, public.public_share_reports
  from public, anon, authenticated;

-- Trigger / helper DEFINER functions (not user RPCs, not RLS helpers).
revoke execute on function
  public.handle_new_user(),
  public.set_updated_at(),
  public.sync_post_blurred_geom(),
  public.sync_post_counts(),
  public.guard_post_blurred_geom(),
  public.hide_reported_content(),
  public.reject_objectionable(),
  public.guard_report_rate(),
  public.guard_crew_admin_changes(),
  public.guard_crew_capacity(),
  public.guard_last_crew_admin(),
  public.crew_after_member_delete(),
  public.set_post_crew_only(),
  public.guard_group_kind(),
  public.guard_member_identity(),
  public.guard_post_group(),
  public.delete_crew_content(),
  public.set_post_public_after(),
  public.set_comment_public_after(),
  public.guard_public_post_edit(),
  public.set_place_county(),
  public.reset_post_public_after(),
  public.reset_parent_public_after(),
  public.plans_touch(),
  public.hunt_log_entries_guard(),
  public.unshare_plans_on_leave(),
  public.revoke_crew_share_links_on_leave(),
  public.guard_share_link_immutable(),
  public.guard_test_account_write(),
  public.guard_test_account_plan(),
  public.guard_test_account_profile(),
  public.guard_hunt_log_created_at(),
  public.contains_objectionable(text)
from public, anon, authenticated;
