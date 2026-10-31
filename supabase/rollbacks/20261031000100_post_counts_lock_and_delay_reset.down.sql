drop trigger if exists post_place_counts_reset_public_after on public.post_place_counts;
drop trigger if exists post_locations_reset_public_after on public.post_locations;
drop trigger if exists posts_reset_public_after_on_edit on public.posts;
drop trigger if exists post_place_counts_lock_after_public on public.post_place_counts;
drop function if exists public.reset_parent_public_after();
drop function if exists public.reset_post_public_after();
