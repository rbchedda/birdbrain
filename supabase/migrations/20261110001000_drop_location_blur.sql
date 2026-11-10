-- Remove location blur. After the delay, anyone who can see a post sees the
-- exact point in posts.public_geom (null when location_visibility = 'hidden').
-- Authors already see their own posts immediately via can_see_post_row.
--
-- location_visibility stays 'hidden' | 'blurred'. The 'blurred' value is a
-- historical name that now means "share the exact point". No ALTER TYPE, so
-- this is safe in a single transaction on current Postgres and PGlite.
--
-- Diary public share stays county-only (L7, 20261109002008). Crew share still
-- returns a point, now the public place centroid rather than a keyed blur.
--
-- posts_reset_public_after_on_edit and related delay triggers are unchanged.
-- Rollback: supabase/rollbacks/20261110001000_drop_location_blur.down.sql
-- (cannot restore the previous salt or historically blurred points).

alter table public.posts
  add column if not exists public_geom extensions.geometry(Point, 4326);

create index if not exists posts_public_geom_idx on public.posts using gist (public_geom);

create or replace function public.sync_post_public_geom() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.posts p
     set public_geom = case
       when tg_op = 'DELETE' or p.location_visibility = 'hidden' then null
       else new.geom
     end
   where p.id = coalesce(new.post_id, old.post_id);
  return null;
end;
$$;

create or replace function public.guard_post_public_geom() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.location_visibility = 'hidden' then
    new.public_geom := null;
  else
    new.public_geom := (
      select l.geom from public.post_locations l where l.post_id = new.id
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_post_public_geom(), public.guard_post_public_geom()
  from public, anon, authenticated;

drop trigger if exists posts_guard_blurred_geom on public.posts;
drop trigger if exists post_locations_sync on public.post_locations;

create trigger posts_guard_public_geom
  before insert or update on public.posts
  for each row execute function public.guard_post_public_geom();

create trigger post_locations_sync_public_geom
  after insert or update or delete on public.post_locations
  for each row execute function public.sync_post_public_geom();

-- Backfill from exact post_locations. The BEFORE trigger recomputes the same
-- value; this UPDATE does not list columns that reset public_after.
update public.posts p
   set public_geom = case
     when p.location_visibility = 'hidden' then null
     else l.geom
   end
  from public.post_locations l
 where l.post_id = p.id;

-- ---------------------------------------------------------------------------
-- Crew diary share: keep the return shape, stop calling blur_point_keyed.
-- ---------------------------------------------------------------------------
create or replace function public.read_crew_shared_diary(p_token text)
returns table (
  live boolean,
  live_at timestamptz,
  species public.species,
  caption text,
  hunted_on date,
  county text,
  place_name text,
  blurred_lng double precision,
  blurred_lat double precision,
  hours numeric,
  flushes integer,
  birds jsonb,
  dog_names text[],
  cover jsonb,
  has_photo boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  h bytea := sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  sl public.share_links;
  e public.hunt_log_entries;
  d jsonb;
  place_uuid uuid;
  loc extensions.geometry;
  cty text;
  pname text;
  lat_live timestamptz;
begin
  if uid is null then
    return;
  end if;

  select * into sl from public.share_links s
   where s.token_hash = h
     and s.audience = 'crew'
     and public.share_link_is_active(s.revoked_at, s.expires_at);
  if not found then
    return;
  end if;
  if sl.crew_id is null or not exists (
    select 1 from public.group_members gm
     where gm.group_id = sl.crew_id and gm.user_id = uid
  ) then
    return; -- not a member: same empty response as invalid
  end if;
  -- Owner must still be in the crew (mint-time check is not enough).
  if not exists (
    select 1 from public.group_members om
     where om.group_id = sl.crew_id and om.user_id = sl.owner_id
  ) then
    return;
  end if;

  select * into e from public.hunt_log_entries where id = sl.entry_id;
  if not found then
    return;
  end if;
  select de.details into d from public.diary_entries de where de.entry_id = sl.entry_id;

  lat_live := public.diary_share_live_at(e.hunted_on, e.created_at, sl.created_at);
  if lat_live > now() then
    return query select
      false, lat_live, null::public.species, null::text, null::date, null::text, null::text,
      null::double precision, null::double precision, null::numeric, null::integer,
      null::jsonb, null::text[], null::jsonb, null::boolean;
    return;
  end if;

  begin
    place_uuid := nullif(coalesce(e.place_counts->0->>'placeId', e.place_counts->0->>'place_id'), '')::uuid;
  exception when others then
    place_uuid := null;
  end;
  if place_uuid is not null then
    -- SGL / place name OK for crew; never returned by public.read_shared_diary.
    -- Column names blurred_lng/lat are historical; they now hold the place centroid.
    select p.county, p.name, p.centroid
      into cty, pname, loc
      from public.places p where p.id = place_uuid;
  end if;

  return query select
    true,
    lat_live,
    e.species,
    e.caption,
    e.hunted_on,
    cty,
    pname,
    case when loc is null then null else extensions.st_x(loc) end,
    case when loc is null then null else extensions.st_y(loc) end,
    case when d is null then null else nullif(d->>'hours', '')::numeric end,
    case when d is null then null else coalesce((d->>'flushes')::integer, 0) end,
    case
      when d is null or d->'birds' is null then '[]'::jsonb
      else (
        select coalesce(jsonb_agg(jsonb_build_object(
          'species', b->>'species',
          'count', coalesce((b->>'count')::int, 0)
        )), '[]'::jsonb)
        from jsonb_array_elements(coalesce(d->'birds', '[]'::jsonb)) b
      )
    end,
    case
      when d is null or d->'dogs' is null then '{}'::text[]
      else coalesce((
        select array_agg(distinct b->>'name') filter (where coalesce(b->>'name', '') <> '')
        from jsonb_array_elements(coalesce(d->'dogs', '[]'::jsonb)) b
      ), '{}'::text[])
    end,
    case when d is null then '[]'::jsonb else coalesce(d->'cover', '[]'::jsonb) end,
    case when d is null then false else jsonb_array_length(coalesce(d->'photos', '[]'::jsonb)) > 0 end;
end;
$$;


-- ---------------------------------------------------------------------------
-- Drop blur machinery. public.read_shared_diary (02008) no longer calls it.
-- ---------------------------------------------------------------------------
drop function if exists public.guard_post_blurred_geom();
drop function if exists public.sync_post_blurred_geom();
drop function if exists public.blur_point_keyed(extensions.geometry, uuid);
drop function if exists public.blur_point(extensions.geometry);

drop index if exists public.posts_blurred_geom_idx;
alter table public.posts drop column if exists blurred_geom;

drop table if exists private.blur_salt;
