drop trigger if exists group_members_revoke_crew_share_links on public.group_members;
drop function if exists public.revoke_crew_share_links_on_leave();

-- Restore the pre-hardening body (owner membership is not required).
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
  blur extensions.geometry;
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

  select * into e from public.hunt_log_entries where id = sl.entry_id;
  if not found then
    return;
  end if;
  select de.details into d from public.diary_entries de where de.entry_id = sl.entry_id;

  lat_live := public.diary_share_live_at(e.hunted_on, e.created_at);
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
    select p.county, p.name, public.blur_point_keyed(p.centroid, sl.owner_id)
      into cty, pname, blur
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
    case when blur is null then null else extensions.st_x(blur) end,
    case when blur is null then null else extensions.st_y(blur) end,
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

revoke execute on function public.read_crew_shared_diary(text) from public, anon;
grant execute on function public.read_crew_shared_diary(text) to authenticated;
