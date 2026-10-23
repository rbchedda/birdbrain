grant execute on function
  public.can_read_post_photo(text), public.can_see_post_id(uuid), public.contains_objectionable(text),
  public.crew_after_member_delete(), public.guard_crew_admin_changes(), public.guard_crew_capacity(),
  public.guard_last_crew_admin(), public.guard_post_blurred_geom(), public.handle_new_user(),
  public.hide_reported_content(), public.is_blocked_between(uuid, uuid), public.is_group_admin(uuid),
  public.set_post_crew_only(), public.sync_post_blurred_geom(), public.sync_post_counts()
to public, anon;
