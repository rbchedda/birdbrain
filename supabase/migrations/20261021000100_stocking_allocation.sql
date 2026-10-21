-- BirdBrain v0.3: pheasant release windows from PGC's allocation tables.
--
-- Loaded by ingest/stocking_windows.mjs from data/pgc/pheasant-allocation-<season>.json.
-- PGC publishes, per region page:
--   * which properties in each county are stocked (game lands and others), with
--     some game lands marked for the 2nd and 3rd winter releases too, and
--   * cocks and hens per county for each release, with the week it ships.
-- Counts are per county, not per property, so they live on stocking_events
-- and the property list lives on stocking_properties.
--
-- The initial schema's stocking_events (one row per place, counts as jsonb)
-- never had a writer and can't hold county-level counts, so it is replaced.
-- Public read; writes only via the service role (RLS on, no write policies).

drop table public.stocking_events;

create table public.stocking_events (
  id uuid primary key default gen_random_uuid(),
  season text not null check (season ~ '^\d{4}-\d{2}$'), -- license year, e.g. '2026-27'
  region text not null,                                  -- PGC region, e.g. 'Northcentral'
  county text not null,
  release text not null check (release ~ '^(youth|pre_season|in_season_\d+|winter_\d+)$'),
  release_label text not null,                           -- as published, e.g. '1ST IN- SEASON'
  junior boolean not null,                               -- the junior (youth) hunt release
  ship_week text not null,                               -- as published, e.g. 'Nov. 3-6'
  window_start date not null,
  window_end date not null,
  cocks integer not null check (cocks >= 0),
  hens integer not null check (hens >= 0),
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season, county, release),
  check (window_end >= window_start)
);
create index stocking_events_window_idx on public.stocking_events (window_start, county);

create table public.stocking_properties (
  id uuid primary key default gen_random_uuid(),
  season text not null check (season ~ '^\d{4}-\d{2}$'),
  region text not null,
  county text not null,
  name text not null,                                    -- 'State Game Lands 252' or as published
  sgl integer,
  -- Bold-underlined on PGC's page: also stocked in the 2nd and 3rd winter releases.
  winter_late boolean not null default false,
  -- Matching stocking point or game land, when the loader can tell.
  place_id uuid references public.places (id) on delete set null,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season, county, name)
);
create index stocking_properties_place_idx on public.stocking_properties (place_id);
create index stocking_properties_sgl_idx on public.stocking_properties (sgl);

alter table public.stocking_events enable row level security;
alter table public.stocking_properties enable row level security;

create policy "stocking events are public" on public.stocking_events
  for select to anon, authenticated using (true);
create policy "stocking properties are public" on public.stocking_properties
  for select to anon, authenticated using (true);

-- Junior and adult (regular plus winter) totals per county and season.
create view public.stocking_county_totals with (security_invoker = true) as
  select season, region, county,
         sum(cocks) filter (where junior)::int     as junior_cocks,
         sum(hens) filter (where junior)::int      as junior_hens,
         sum(cocks) filter (where not junior)::int as adult_cocks,
         sum(hens) filter (where not junior)::int  as adult_hens,
         min(window_start) filter (where not junior) as first_adult_window,
         max(window_end) as last_window
    from public.stocking_events
   group by season, region, county;
