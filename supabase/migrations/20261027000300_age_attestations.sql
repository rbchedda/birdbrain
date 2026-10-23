-- Privacy P2: server-side record that the account holder attested to being 13+.
-- Rollback: supabase/rollbacks/20261027000300_age_attestations.down.sql
create table public.age_attestations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  min_age smallint not null default 13 check (min_age >= 13),
  method text not null default 'birth_year' check (method in ('birth_year')),
  attested_at timestamptz not null default now()
);
alter table public.age_attestations enable row level security;
revoke all on public.age_attestations from public, anon, authenticated;
grant select, insert on public.age_attestations to authenticated;
create policy age_attestations_insert_own on public.age_attestations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy age_attestations_select_own on public.age_attestations for select to authenticated
  using (user_id = (select auth.uid()));
