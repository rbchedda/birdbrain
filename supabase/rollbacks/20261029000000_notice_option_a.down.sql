-- Rollback for 20261029000000_notice_option_a. Drops the new columns (their data is lost).
-- Fails if a user has two consent rows for one terms_version (re-consent rows): delete the
-- newer duplicates first, e.g.
--   delete from public.accepted_terms a using public.accepted_terms b
--   where a.user_id = b.user_id and a.terms_version = b.terms_version and a.id > b.id;
drop index if exists public.notice_acknowledgements_user_client_key;
delete from public.notice_acknowledgements where kind = 'notice_restore';
alter table public.notice_acknowledgements drop constraint notice_acknowledgements_kind_check;
alter table public.notice_acknowledgements add constraint notice_acknowledgements_kind_check
  check (kind in ('onboarding_consent', 'notice_dismiss'));
alter table public.notice_acknowledgements
  drop column method, drop column platform, drop column dismissed_at, drop column client_id;
revoke insert on public.notice_acknowledgements from authenticated;
grant insert (user_id, kind, notice_version, app_version) on public.notice_acknowledgements to authenticated;

drop index if exists public.accepted_terms_user_terms_notice_key;
alter table public.accepted_terms add constraint accepted_terms_user_id_terms_version_key unique (user_id, terms_version);
alter table public.accepted_terms drop column notice_version, drop column platform;
revoke insert on public.accepted_terms from authenticated;
grant insert (user_id, accepted_at, app_version, terms_version) on public.accepted_terms to authenticated;
delete from supabase_migrations.schema_migrations where version='20261029000000';
