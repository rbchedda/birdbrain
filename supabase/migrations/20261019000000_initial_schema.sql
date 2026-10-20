-- BirdBrain v0.1 schema.
-- Privacy rules baked in here:
--   * Exact post locations live in post_locations, readable only by the author.
--     posts.blurred_geom is derived from it by trigger and is all anyone else sees.
--   * Saved spots and saved posts are private to their owner.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.species as enum ('pheasant', 'dove', 'turkey', 'grouse', 'waterfowl');
create type public.place_type as enum ('game_land', 'stocking', 'dove_field');
create type public.post_kind as enum ('hunt', 'harvest');
create type public.location_visibility as enum ('hidden', 'blurred');
create type public.group_role as enum ('member', 'admin');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text check (char_length(display_name) <= 60),
  avatar_path text,
  -- Pennsylvania only at launch.
  home_state text not null default 'PA' check (home_state in ('PA')),
  has_dog boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.species_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  species public.species not null,
  created_at timestamptz not null default now(),
  primary key (user_id, species)
);

create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  breed text check (char_length(breed) <= 60),
  created_at timestamptz not null default now()
);
create index dogs_owner_idx on public.dogs (owner_id);

-- ---------------------------------------------------------------------------
-- Places (public reference data, written by ingestion jobs with the service role)
-- ---------------------------------------------------------------------------

create table public.places (
  id uuid primary key default gen_random_uuid(),
  type public.place_type not null,
  name text not null,
  state text not null default 'PA',
  county text,
  species public.species[] not null default '{}',
  geom extensions.geometry(Geometry, 4326) not null,
  centroid extensions.geometry(Point, 4326)
    generated always as (extensions.st_pointonsurface(geom)) stored,
  acres numeric,
  -- Where the row came from, e.g. source = 'pasda:pgc_state_game_lands', source_id = 'SGL 211'.
  source text not null,
  source_id text not null,
  source_updated_at timestamptz,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index places_geom_idx on public.places using gist (geom);
create index places_centroid_idx on public.places using gist (centroid);
create index places_type_idx on public.places (type);

create table public.stocking_events (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  season text not null, -- license year, e.g. '2026-27'
  window_start date not null,
  window_end date not null,
  -- e.g. {"roosters": 400, "hens": 100}; shape follows the PGC allocation tables.
  counts jsonb not null default '{}',
  source text not null,
  created_at timestamptz not null default now(),
  check (window_end >= window_start)
);
create index stocking_events_place_idx on public.stocking_events (place_id, window_start);

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  name text not null check (char_length(name) between 3 and 60),
  description text check (char_length(description) <= 500),
  species public.species,
  is_official boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- ---------------------------------------------------------------------------
-- Posts and engagement
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind public.post_kind not null default 'harvest',
  species public.species,
  caption text check (char_length(caption) <= 2000),
  -- Storage path in the post-photos bucket. Clients must strip EXIF/GPS before upload.
  photo_path text,
  group_id uuid references public.groups (id) on delete set null,
  location_visibility public.location_visibility not null default 'blurred',
  -- Derived from post_locations by trigger; never written by clients.
  blurred_geom extensions.geometry(Point, 4326),
  hunted_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_group_idx on public.posts (group_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);
create index posts_blurred_geom_idx on public.posts using gist (blurred_geom);

create table public.post_locations (
  post_id uuid primary key references public.posts (id) on delete cascade,
  geom extensions.geometry(Point, 4326) not null
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index likes_user_idx on public.likes (user_id);

create table public.saves (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index saves_user_idx on public.saves (user_id, created_at desc);

create table public.saved_places (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- ---------------------------------------------------------------------------
-- Functions and triggers
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger places_updated_at before update on public.places
  for each row execute function public.set_updated_at();
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

-- Create a profile row for every new auth user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Snap a point to a ~0.05 degree grid cell center (about 5.5 km N-S, 4 km E-W in PA).
create function public.blur_point(p extensions.geometry) returns extensions.geometry
language sql immutable set search_path = '' as $$
  select extensions.st_setsrid(
    extensions.st_makepoint(
      floor(extensions.st_x(p) / 0.05) * 0.05 + 0.025,
      floor(extensions.st_y(p) / 0.05) * 0.05 + 0.025
    ),
    4326
  );
$$;

create function public.sync_post_blurred_geom() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts p
     set blurred_geom = case
       when tg_op = 'DELETE' or p.location_visibility = 'hidden' then null
       else public.blur_point(new.geom)
     end
   where p.id = target;
  return null;
end;
$$;

create trigger post_locations_sync after insert or update or delete on public.post_locations
  for each row execute function public.sync_post_blurred_geom();

-- Clients can't write blurred_geom directly; recompute it whenever visibility changes.
create function public.guard_post_blurred_geom() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.blurred_geom := null;
  elsif new.location_visibility = 'hidden' then
    new.blurred_geom := null;
  else
    new.blurred_geom := (
      select public.blur_point(l.geom) from public.post_locations l where l.post_id = new.id
    );
  end if;
  return new;
end;
$$;

create trigger posts_guard_blurred_geom before insert or update on public.posts
  for each row execute function public.guard_post_blurred_geom();

-- The trigger above recomputes on every posts update, which also covers the
-- update issued by sync_post_blurred_geom (it reads the just-written location).

create function public.is_group_admin(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members
     where group_id = gid and user_id = auth.uid() and role = 'admin'
  );
$$;

-- Places within radius_m meters of a point, nearest first.
create function public.places_near(lng double precision, lat double precision, radius_m double precision default 50000)
returns setof public.places
language sql stable set search_path = '' as $$
  select *
    from public.places
   where extensions.st_dwithin(
           geom::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography,
           radius_m)
   order by centroid operator(extensions.<->) extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326);
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.species_prefs enable row level security;
alter table public.dogs enable row level security;
alter table public.places enable row level security;
alter table public.stocking_events enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.posts enable row level security;
alter table public.post_locations enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.saves enable row level security;
alter table public.saved_places enable row level security;

-- profiles
create policy "profiles are visible to signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "users update their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- species_prefs, dogs: owner only
create policy "own species prefs" on public.species_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own dogs" on public.dogs
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- places, stocking_events: public read; writes only via service role (bypasses RLS)
create policy "places are public" on public.places
  for select to anon, authenticated using (true);
create policy "stocking events are public" on public.stocking_events
  for select to anon, authenticated using (true);

-- groups
create policy "groups are visible to signed-in users" on public.groups
  for select to authenticated using (true);
create policy "users create unofficial groups" on public.groups
  for insert to authenticated with check (created_by = auth.uid() and not is_official);
create policy "group admins update groups" on public.groups
  for update to authenticated using (public.is_group_admin(id))
  with check (public.is_group_admin(id) and not is_official);

-- group_members
create policy "memberships are visible to signed-in users" on public.group_members
  for select to authenticated using (true);
create policy "users join groups as members" on public.group_members
  for insert to authenticated with check (user_id = auth.uid() and role = 'member');
create policy "users leave groups; admins remove members" on public.group_members
  for delete to authenticated using (user_id = auth.uid() or public.is_group_admin(group_id));

-- posts
create policy "posts are visible to signed-in users" on public.posts
  for select to authenticated using (true);
create policy "users create their own posts" on public.posts
  for insert to authenticated with check (author_id = auth.uid());
create policy "users update their own posts" on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "users delete their own posts" on public.posts
  for delete to authenticated using (author_id = auth.uid());

-- post_locations: author only, never visible to anyone else
create policy "authors manage exact post locations" on public.post_locations
  for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

-- comments
create policy "comments are visible to signed-in users" on public.comments
  for select to authenticated using (true);
create policy "users comment as themselves" on public.comments
  for insert to authenticated with check (author_id = auth.uid());
create policy "users delete their own comments" on public.comments
  for delete to authenticated using (author_id = auth.uid());

-- likes
create policy "likes are visible to signed-in users" on public.likes
  for select to authenticated using (true);
create policy "users like as themselves" on public.likes
  for insert to authenticated with check (user_id = auth.uid());
create policy "users remove their own likes" on public.likes
  for delete to authenticated using (user_id = auth.uid());

-- saves, saved_places: owner only
create policy "own saved posts" on public.saves
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own saved places" on public.saved_places
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Clients never write blurred_geom; triggers own it. Column-level grants enforce that.
revoke insert, update on public.posts from anon, authenticated;
grant insert (author_id, kind, species, caption, photo_path, group_id, location_visibility, hunted_on)
  on public.posts to authenticated;
grant update (kind, species, caption, photo_path, group_id, location_visibility, hunted_on)
  on public.posts to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: one official group per species
-- ---------------------------------------------------------------------------

insert into public.groups (slug, name, description, species, is_official) values
  ('pa-pheasant', 'PA Pheasant', 'Stocking updates, dog work and field reports.', 'pheasant', true),
  ('pa-dove', 'PA Dove', 'Managed fields, opening day and migratory rules.', 'dove', true),
  ('pa-turkey', 'PA Turkey', 'Spring and fall turkey across the Commonwealth.', 'turkey', true),
  ('pa-grouse', 'PA Grouse', 'Ruffed grouse cover, flush counts and habitat.', 'grouse', true),
  ('pa-waterfowl', 'PA Waterfowl', 'Ducks and geese: zones, stamps and blinds.', 'waterfowl', true);
