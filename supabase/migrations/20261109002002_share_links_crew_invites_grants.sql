-- Repo L3 / live L2: clients may only UPDATE share_links.revoked_at, and
-- share_links expires_at cannot exceed created_at + 365 days. crew_invites
-- created_at and expires_at are no longer client-writable (inserts stay
-- RPC-only; admins may still set revoked_at).
-- Rollback: supabase/rollbacks/20261109002002_share_links_crew_invites_grants.down.sql

alter table public.share_links
  add constraint share_links_max_365_days
  check (expires_at <= created_at + interval '365 days');

revoke update on public.share_links from public, anon, authenticated;
grant update (revoked_at) on public.share_links to authenticated;

revoke update on public.crew_invites from public, anon, authenticated;
grant update (revoked_at) on public.crew_invites to authenticated;
