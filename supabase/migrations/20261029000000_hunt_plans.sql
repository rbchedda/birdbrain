-- Hunt plans (spot detail > Plan a hunt, Profile > Plans). NOT APPROVED FOR HOSTED:
-- local/PGlite only until a hosted plans table is signed off. The app keeps plans on
-- the phone and only touches this table when EXPO_PUBLIC_FLAG_PLANS=1.
-- Owner-only: every policy is user_id = auth.uid(); no anon grants. Crew sharing is a
-- column only; crew members cannot read shared plans until a separate policy is approved.
create table public.hunt_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null,
  place_id text not null check (length(place_id) between 1 and 200),
  planned_on date not null,
  species text[] not null default '{}' check (cardinality(species) <= 20),
  notes text check (notes is null or length(notes) <= 500),
  reminder text not null default 'none' check (reminder in ('none', 'night_before', 'hour_before')),
  shared_crew_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create index hunt_plans_user_date_idx on public.hunt_plans (user_id, planned_on);

alter table public.hunt_plans enable row level security;

create policy hunt_plans_select_own on public.hunt_plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy hunt_plans_insert_own on public.hunt_plans
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  );
create policy hunt_plans_update_own on public.hunt_plans
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy hunt_plans_delete_own on public.hunt_plans
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.hunt_plans from anon, authenticated;
grant select, delete on public.hunt_plans to authenticated;
grant insert (user_id, client_id, place_id, planned_on, species, notes, reminder, shared_crew_id) on public.hunt_plans to authenticated;
grant update (place_id, planned_on, species, notes, reminder, shared_crew_id, updated_at) on public.hunt_plans to authenticated;
