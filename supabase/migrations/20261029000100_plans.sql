create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null,                       -- offline queue id; replays are no-ops
  place_id text not null check (length(place_id) between 1 and 128),
  place_name text not null check (length(place_name) between 1 and 200),
  plan_date date not null,
  species text[] not null default '{}' check (cardinality(species) <= 20),
  notes text check (notes is null or length(notes) <= 500),
  reminder text not null default 'none' check (reminder in ('none', 'night_before_8pm', 'hour_before_legal')),
  crew_id uuid references public.groups (id) on delete set null,   -- used only once #3 is applied
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index plans_user_date_idx on public.plans (user_id, plan_date desc);

alter table public.plans enable row level security;
create policy plans_select_own on public.plans for select to authenticated
  using (user_id = (select auth.uid()));
create policy plans_insert_own on public.plans for insert to authenticated
  with check (user_id = (select auth.uid())
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    and crew_id is null);
create policy plans_update_own on public.plans for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and crew_id is null);
create policy plans_delete_own on public.plans for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.plans_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger plans_touch before update on public.plans for each row execute function public.plans_touch();

revoke all on public.plans from anon, authenticated;
grant select, delete on public.plans to authenticated;
grant insert (user_id, client_id, place_id, place_name, plan_date, species, notes, reminder, crew_id),
      update (place_id, place_name, plan_date, species, notes, reminder, crew_id)
  on public.plans to authenticated;
