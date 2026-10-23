-- Security L2: SECURITY DEFINER helpers and trigger functions are not callable by anon
-- (or PUBLIC) via /rpc. authenticated keeps its explicit grants (RLS policies need them).
-- Trigger functions still fire: EXECUTE is checked only at CREATE TRIGGER time.
-- Rollback: supabase/rollbacks/20261027000100_revoke_anon_definer_execute.down.sql
revoke execute on function
  public.can_read_post_photo(text), public.can_see_post_id(uuid), public.contains_objectionable(text),
  public.crew_after_member_delete(), public.guard_crew_admin_changes(), public.guard_crew_capacity(),
  public.guard_last_crew_admin(), public.guard_post_blurred_geom(), public.handle_new_user(),
  public.hide_reported_content(), public.is_blocked_between(uuid, uuid), public.is_group_admin(uuid),
  public.set_post_crew_only(), public.sync_post_blurred_geom(), public.sync_post_counts()
from public, anon;
