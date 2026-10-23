-- Notice Option A (HANDOFF §2, counsel-approved Oct 23 2026). NOT APPLIED to hosted yet.
-- Rollback: supabase/rollbacks/20261029000000_notice_option_a.down.sql

-- 1) Onboarding consent records the notice version and platform. Re-consent after a
--    MAP_NOTICE_VERSION bump is a new row for the same terms_version, so the unique key
--    widens to include notice_version. Old rows keep notice_version null.
alter table public.accepted_terms
  add column notice_version text check (notice_version is null or length(notice_version) between 1 and 64),
  add column platform text check (platform is null or platform in ('ios', 'android', 'web'));
alter table public.accepted_terms drop constraint accepted_terms_user_id_terms_version_key;
create unique index accepted_terms_user_terms_notice_key
  on public.accepted_terms (user_id, terms_version, coalesce(notice_version, ''));
revoke insert on public.accepted_terms from authenticated;
grant insert (user_id, accepted_at, app_version, terms_version, notice_version, platform)
  on public.accepted_terms to authenticated;

-- 2) Dismissals: how (close | got_it), when on the device (queued offline), platform,
--    'notice_restore' for "Show on map" so the state syncs across devices, and a
--    client_id so a replayed offline queue item is a no-op.
alter table public.notice_acknowledgements
  add column method text check (method is null or method in ('close', 'got_it', 'show_on_map')),
  add column platform text check (platform is null or platform in ('ios', 'android', 'web')),
  add column dismissed_at timestamptz check (dismissed_at is null or dismissed_at <= now() + interval '5 minutes'),
  add column client_id uuid;
alter table public.notice_acknowledgements drop constraint notice_acknowledgements_kind_check;
alter table public.notice_acknowledgements add constraint notice_acknowledgements_kind_check
  check (kind in ('onboarding_consent', 'notice_dismiss', 'notice_restore'));
create unique index notice_acknowledgements_user_client_key
  on public.notice_acknowledgements (user_id, client_id) where client_id is not null;
revoke insert on public.notice_acknowledgements from authenticated;
grant insert (user_id, kind, notice_version, app_version, method, platform, dismissed_at, client_id)
  on public.notice_acknowledgements to authenticated;
-- RLS unchanged: owners select/insert their own rows only, no update/delete, no anon.
