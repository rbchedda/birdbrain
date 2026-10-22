-- Onboarding consent log (liability memo §4C): one row per user per terms
-- version accepted, with when and from which app build. Append-only for the
-- user: they can insert and read their own rows, never another user's, and
-- can't edit or delete them. Rows go away with the account (FK cascade).
create table public.accepted_terms (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Client time of the tap (acceptance can be queued offline); not in the future.
  accepted_at timestamptz not null default now() check (accepted_at <= now() + interval '5 minutes'),
  app_version text not null check (length(app_version) between 1 and 64),
  terms_version text not null check (length(terms_version) between 1 and 64),
  recorded_at timestamptz not null default now(),
  -- Re-sending a queued acceptance is a no-op (on conflict do nothing).
  unique (user_id, terms_version)
);

create index accepted_terms_user_idx on public.accepted_terms (user_id);

alter table public.accepted_terms enable row level security;

create policy accepted_terms_select_own on public.accepted_terms
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy accepted_terms_insert_own on public.accepted_terms
  for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on public.accepted_terms from anon, authenticated;
grant select, insert (user_id, accepted_at, app_version, terms_version) on public.accepted_terms to authenticated;
