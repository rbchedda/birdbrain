-- Restores anon table privileges exactly as captured 2026-10-23 (acl-snapshot-before.json).
grant all on
  public.blocklist_terms, public.counties, public.dogs, public.group_members, public.groups,
  public.ingest_state, public.likes, public.place_stocking_county, public.places, public.post_locations,
  public.post_place_counts, public.profiles, public.saved_places, public.saves, public.species_prefs,
  public.stocking_county_totals, public.stocking_events, public.stocking_properties, public.user_blocks
to anon;
grant select, delete, truncate, references, trigger, maintain on public.comments, public.posts, public.reports to anon;
