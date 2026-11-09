-- Repo L10: hunt_log_entries.created_at is server-owned (forced to now() on
-- insert, immutable on update). Clients may still include the column in an
-- upsert; the trigger overwrites it, so offline sync does not error.
-- diary_share_live_at is also gated on share_links.created_at + min_public_delay()
-- so backdating hunted_on cannot make a freshly minted share go live at once.
-- public_diary_share_enabled() and share_link_view_counts_enabled() stay false.
-- Rollback: supabase/rollbacks/20261109002006_hunt_log_created_at_and_share_delay.down.sql

create function public.guard_hunt_log_created_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
revoke execute on function public.guard_hunt_log_created_at() from public, anon, authenticated;
drop trigger if exists hunt_log_entries_created_at on public.hunt_log_entries;
create trigger hunt_log_entries_created_at
  before insert or update on public.hunt_log_entries
  for each row execute function public.guard_hunt_log_created_at();


-- 2-arg form (hunt date / entry created_at) is unchanged and stays the
-- building block. The 3-arg form is what readers and mint RPCs use:
-- live_at is the later of the hunt-date rule and link.created_at + 12h,
-- so backdating hunted_on cannot make a fresh share go live immediately.
create function public.diary_share_live_at(p_hunted_on date, p_entry_created_at timestamptz, p_link_created_at timestamptz)
returns timestamptz
language sql immutable set search_path = '' as $$
  select greatest(
    public.diary_share_live_at(p_hunted_on, p_entry_created_at),
    p_link_created_at + public.min_public_delay()
  );
$$;
revoke execute on function public.diary_share_live_at(date, timestamptz, timestamptz)
  from public, anon, authenticated;

create or replace function public.create_diary_share_link(p_client_id uuid, p_crew_id uuid, p_ttl_days integer default 30)
returns table (token text, link_id uuid, shared_at timestamptz, expires_at timestamptz, live_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  eid uuid;
  hunted date;
  created timestamptz;
  t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  lid uuid;
  cat timestamptz;
  exp timestamptz;
  live timestamptz;
  ttl integer := greatest(1, least(coalesce(p_ttl_days, 30), 365)); -- DIARY_SHARE_MAX_TTL_DAYS
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_crew_id is null or not public.is_crew(p_crew_id) or not public.is_group_member(p_crew_id) then
    raise exception 'crew not found' using errcode = 'P0002';
  end if;
  select e.id, e.hunted_on, e.created_at into eid, hunted, created
    from public.hunt_log_entries e
   where e.client_id = p_client_id and e.owner_id = uid;
  if eid is null then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;

  update public.share_links s
     set revoked_at = now()
   where s.entry_id = eid and s.revoked_at is null;

  exp := now() + (ttl::text || ' days')::interval;

  insert into public.share_links as sl (entry_id, owner_id, token_hash, audience, crew_id, expires_at)
  values (eid, uid, sha256(convert_to(t, 'UTF8')), 'crew', p_crew_id, exp)
  returning sl.id, sl.created_at, sl.expires_at into lid, cat, exp;

  live := public.diary_share_live_at(hunted, created, cat);
  return query select t, lid, cat, exp, live;
end;
$$;

create or replace function public.create_public_diary_share_link(p_client_id uuid, p_ttl_days integer default 30)
returns table (token text, link_id uuid, shared_at timestamptz, expires_at timestamptz, live_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  eid uuid;
  hunted date;
  created timestamptz;
  t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  lid uuid;
  cat timestamptz;
  exp timestamptz;
  live timestamptz;
  ttl integer := greatest(1, least(coalesce(p_ttl_days, 30), 365));
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if not public.public_diary_share_enabled() then
    raise exception 'public diary share is disabled' using errcode = 'P0001';
  end if;
  select e.id, e.hunted_on, e.created_at into eid, hunted, created
    from public.hunt_log_entries e
   where e.client_id = p_client_id and e.owner_id = uid;
  if eid is null then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;

  update public.share_links s
     set revoked_at = now()
   where s.entry_id = eid and s.revoked_at is null;

  exp := now() + (ttl::text || ' days')::interval;

  insert into public.share_links as sl (entry_id, owner_id, token_hash, audience, crew_id, expires_at)
  values (eid, uid, sha256(convert_to(t, 'UTF8')), 'public', null, exp)
  returning sl.id, sl.created_at, sl.expires_at into lid, cat, exp;

  live := public.diary_share_live_at(hunted, created, cat);
  return query select t, lid, cat, exp, live;
end;
$$;

create or replace function public.diary_share_status(p_client_id uuid)
returns table (
  shared boolean,
  link_id uuid,
  shared_at timestamptz,
  expires_at timestamptz,
  live_at timestamptz,
  audience text,
  crew_id uuid,
  view_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  eid uuid;
  hunted date;
  created timestamptz;
  rid uuid;
  r_created timestamptz;
  r_exp timestamptz;
  r_aud text;
  r_crew uuid;
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select e.id, e.hunted_on, e.created_at into eid, hunted, created
    from public.hunt_log_entries e
   where e.client_id = p_client_id and e.owner_id = uid;
  if eid is null then
    return query select false, null::uuid, null::timestamptz, null::timestamptz, null::timestamptz, null::text, null::uuid, 0::bigint;
    return;
  end if;
  select s.id, s.created_at, s.expires_at, s.audience, s.crew_id
    into rid, r_created, r_exp, r_aud, r_crew
    from public.share_links s
   where s.entry_id = eid
     and public.share_link_is_active(s.revoked_at, s.expires_at)
   order by s.created_at desc
   limit 1;
  if rid is null then
    return query select false, null::uuid, null::timestamptz, null::timestamptz, null::timestamptz, null::text, null::uuid, 0::bigint;
    return;
  end if;
  return query
    select true, rid, r_created, r_exp, public.diary_share_live_at(hunted, created, r_created), r_aud, r_crew,
           case when public.share_link_view_counts_enabled()
                then coalesce((select c.view_count from public.share_link_view_counts c where c.link_id = rid), 0)
                else 0::bigint end;
end;
$$;

create or replace function public.read_shared_diary(p_token text)
returns table (
  live boolean,
  county text,
  blurred_lng double precision,
  blurred_lat double precision
)
language plpgsql stable security definer set search_path = '' as $$
declare
  h bytea := sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  sl public.share_links;
  e public.hunt_log_entries;
  place_uuid uuid;
  blur extensions.geometry;
  cty text;
  live_at timestamptz;
begin
  if not public.public_diary_share_enabled() then
    return;
  end if;
  select * into sl from public.share_links s
   where s.token_hash = h
     and s.audience = 'public'
     and public.share_link_is_active(s.revoked_at, s.expires_at);
  if not found then
    return; -- unavailable: revoked, expired, invalid, or crew-only token
  end if;

  select * into e from public.hunt_log_entries where id = sl.entry_id;
  if not found then
    return;
  end if;

  live_at := public.diary_share_live_at(e.hunted_on, e.created_at, sl.created_at);
  if live_at > now() then
    return query select false, null::text, null::double precision, null::double precision;
    return;
  end if;

  begin
    place_uuid := nullif(coalesce(e.place_counts->0->>'placeId', e.place_counts->0->>'place_id'), '')::uuid;
  exception when others then
    place_uuid := null;
  end;

  if place_uuid is not null then
    select p.county, public.blur_point_keyed(p.centroid, sl.owner_id)
      into cty, blur
      from public.places p where p.id = place_uuid;
  end if;

  return query select
    true,
    cty,
    case when blur is null then null else extensions.st_x(blur) end,
    case when blur is null then null else extensions.st_y(blur) end;
end;
$$;

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

revoke execute on function public.create_diary_share_link(uuid, uuid, integer),
  public.create_public_diary_share_link(uuid, integer),
  public.diary_share_status(uuid),
  public.read_crew_shared_diary(text)
  from public, anon;
grant execute on function public.create_diary_share_link(uuid, uuid, integer),
  public.create_public_diary_share_link(uuid, integer),
  public.diary_share_status(uuid),
  public.read_crew_shared_diary(text)
  to authenticated;
revoke execute on function public.read_shared_diary(text) from public;
grant execute on function public.read_shared_diary(text) to anon, authenticated;
