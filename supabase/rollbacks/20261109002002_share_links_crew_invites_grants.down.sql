alter table public.share_links drop constraint if exists share_links_max_365_days;
revoke update (revoked_at) on public.share_links from authenticated;
grant update on public.share_links to authenticated;
revoke update (revoked_at) on public.crew_invites from authenticated;
grant update on public.crew_invites to authenticated;
