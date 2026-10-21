-- County for every place, by spatial join with PA county boundaries.
--
-- PGC's stocking, game land and dove layers carry no county, but PGC publishes
-- pheasant release weeks per county (stocking_events.county). Counties come
-- from PGC's own "PA County" layer (PA_Civic_Boundaries/FeatureServer/301;
-- PennDOT / US Census / PGC), loaded by ingest/arcgis.mjs. Its title-case
-- names match stocking_events.county exactly (all 62 allocation counties).
--
-- A place gets the county containing its point on surface (the same point the
-- app pins), so a game land spanning counties gets one county, not several.
-- Rows with a county supplied by the source keep it.

create table public.counties (
  name text primary key,                -- title case, e.g. 'McKean'
  fips text not null unique,            -- 3-digit county FIPS
  pgc_region text,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  source text not null,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now()
);
create index counties_geom_idx on public.counties using gist (geom);

-- Public reference data, like stocking_events. Writes only via the service role.
alter table public.counties enable row level security;
create policy "counties are public" on public.counties for select to anon, authenticated using (true);

create function public.county_at(g extensions.geometry) returns text
language sql stable set search_path = '' as $$
  select c.name from public.counties c
   where extensions.st_intersects(c.geom, extensions.st_pointonsurface(g))
   order by c.name
   limit 1;
$$;

create function public.set_place_county() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.county is null then
    new.county := public.county_at(new.geom);
  end if;
  return new;
end;
$$;

create trigger places_set_county before insert or update on public.places
  for each row execute function public.set_place_county();

-- Fill places that were loaded before (or without) counties. Ingest calls this
-- after each county load. Returns the number of rows updated.
create function public.assign_place_counties() returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  update public.places p set county = public.county_at(p.geom)
   where p.county is null and public.county_at(p.geom) is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.assign_place_counties() from public, anon, authenticated;
