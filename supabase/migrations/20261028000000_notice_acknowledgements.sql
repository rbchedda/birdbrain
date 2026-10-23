-- Map-notice acknowledgement log (legal condition 2, Oct 23). One row per deliberate
-- dismissal of the map boundary notice, per account, with when, which app build and
-- which NOTICE_VERSION. Append-only for the user: insert/select own rows only, no
-- update/delete, no anon. Onboarding consent is already logged in public.accepted_terms
-- (accepted_at, app_version, terms_version), so the app does not write 'onboarding_consent'
-- here; the kind is allowed only so both acknowledgement types share one shape if needed.
create table public.notice_acknowledgements (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('onboarding_consent', 'notice_dismiss')),
  notice_version text not null check (length(notice_version) between 1 and 64),
  app_version text not null check (length(app_version) between 1 and 64),
  created_at timestamptz not null default now()
);

create index notice_acknowledgements_user_idx on public.notice_acknowledgements (user_id, created_at desc);

alter table public.notice_acknowledgements enable row level security;

create policy notice_acknowledgements_select_own on public.notice_acknowledgements
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notice_acknowledgements_insert_own on public.notice_acknowledgements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  );

revoke all on public.notice_acknowledgements from anon, authenticated;
grant select, insert (user_id, kind, notice_version, app_version) on public.notice_acknowledgements to authenticated;
