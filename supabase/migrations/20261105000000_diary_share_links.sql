-- Diary share links (feat/diary-share-link), design: birdbrain-polish/.../share-entry.
-- Entries stay private by default. Owner opts in per entry: share with ONE crew
-- (app, end-to-end) or, later, a public link (lawyer review; app flag defaults OFF).
--
-- Token/expiry/revoke follow crew_invites: store only sha256(token), security-
-- definer RPCs, expires_at, revoked_at. Expired == revoked for readers.
-- Default TTL is 30 days (config constant; max 365; no "Never"). View counts
-- are behind a flag: owner totals only, no who/IP/time in the counts table.
--
-- public.read_shared_diary (anon): county + blurred point ONLY, and only after
-- midnight America/New_York following hunted_on. Pending / unavailable are
-- distinct; revoked, expired and invalid are indistinguishable (empty set).
-- public.read_crew_shared_diary (authenticated crew member): richer in-app
-- payload after the same delay; never exact coords.
-- Rollback: supabase/rollbacks/20261105000000_diary_share_links.down.sql

-- App/config constant (mirrored in app/src/lib/diaryShare.ts). Change both together.
-- DIARY_SHARE_DEFAULT_TTL_DAYS = 30  -- awaiting RBChedda confirmation

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.hunt_log_entries (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash bytea not null unique,
  audience text not null check (audience in ('crew', 'public')),
  crew_id uuid references public.groups (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (expires_at > created_at),
  check (
    (audience = 'crew' and crew_id is not null)
    or (audience = 'public' and crew_id is null)
  )
);

-- At most one active (unrevoked, unexpired) link per entry.
create unique index share_links_one_active_per_entry
  on public.share_links (entry_id)
  where revoked_at is null;
create index share_links_owner_idx on public.share_links (owner_id, created_at desc);
create index share_links_crew_idx on public.share_links (crew_id)
  where audience = 'crew' and revoked_at is null;

alter table public.share_links enable row level security;
revoke all on public.share_links from anon;
revoke insert, truncate, references, trigger on public.share_links from authenticated;

create policy share_links_select_own on public.share_links
  for select to authenticated using (owner_id = auth.uid());
create policy share_links_update_own on public.share_links
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy share_links_delete_own on public.share_links
  for delete to authenticated using (owner_id = auth.uid());

create function public.guard_share_link_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.entry_id is distinct from old.entry_id
     or new.token_hash is distinct from old.token_hash
     or new.owner_id is distinct from old.owner_id
     or new.audience is distinct from old.audience
     or new.crew_id is distinct from old.crew_id then
    raise exception 'share link identity cannot change' using errcode = '42501';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'revoked share link cannot be restored' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger share_links_immutable before update on public.share_links
  for each row execute function public.guard_share_link_immutable();

-- Midnight ET on the calendar day after the hunt date (date-only). Falls back to
-- next_day_et(created_at) when hunted_on is null. Spec mockup: Nov 7 hunt → live Nov 8 12:00 AM ET.
create function public.diary_share_live_at(p_hunted_on date, p_created_at timestamptz)
returns timestamptz
language sql immutable set search_path = '' as $$
  select case
    when p_hunted_on is null then public.next_day_et(p_created_at)
    else (p_hunted_on + 1)::timestamp at time zone 'America/New_York'
  end;
$$;

-- Active = not revoked and not past expires_at.
create function public.share_link_is_active(p_revoked_at timestamptz, p_expires_at timestamptz)
returns boolean
language sql immutable set search_path = '' as $$
  select p_revoked_at is null and p_expires_at > now();
$$;


-- Feature flag for the public no-account viewer + mint. Defaults OFF until lawyer
-- review. Flip to `select true` (or replace) on hosted when approved. App also
-- gates UI with EXPO_PUBLIC_FLAG_PUBLIC_DIARY_SHARE (default off).
create function public.public_diary_share_enabled() returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select false;
$$;

-- Mint/rotate a CREW share link. p_ttl_days: 1..365 (default 30). No "Never" option.
create function public.create_diary_share_link(p_client_id uuid, p_crew_id uuid, p_ttl_days integer default 30)
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
  live := public.diary_share_live_at(hunted, created);

  insert into public.share_links as sl (entry_id, owner_id, token_hash, audience, crew_id, expires_at)
  values (eid, uid, sha256(convert_to(t, 'UTF8')), 'crew', p_crew_id, exp)
  returning sl.id, sl.created_at, sl.expires_at into lid, cat, exp;

  return query select t, lid, cat, exp, live;
end;
$$;

-- Public-audience mint (lawyer / flag-gated in the app). Same token rules; no crew_id.
create function public.create_public_diary_share_link(p_client_id uuid, p_ttl_days integer default 30)
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
  live := public.diary_share_live_at(hunted, created);

  insert into public.share_links as sl (entry_id, owner_id, token_hash, audience, crew_id, expires_at)
  values (eid, uid, sha256(convert_to(t, 'UTF8')), 'public', null, exp)
  returning sl.id, sl.created_at, sl.expires_at into lid, cat, exp;

  return query select t, lid, cat, exp, live;
end;
$$;

create function public.revoke_diary_share_link(p_client_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  eid uuid;
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select e.id into eid from public.hunt_log_entries e
   where e.client_id = p_client_id and e.owner_id = uid;
  if eid is null then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;
  update public.share_links s
     set revoked_at = now()
   where s.entry_id = eid and s.revoked_at is null;
end;
$$;

create function public.diary_share_status(p_client_id uuid)
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
  return query select true, rid, r_created, r_exp, public.diary_share_live_at(hunted, created), r_aud, r_crew, 0::bigint;
end;
$$;

-- Public / anon reader: county + blurred point only. Empty set for
-- revoked/expired/invalid (identical). One row with live=false and nulls when
-- the token is valid but before midnight ET after the hunt.
create function public.read_shared_diary(p_token text)
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

  live_at := public.diary_share_live_at(e.hunted_on, e.created_at);
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

-- In-app crew reader. Auth + membership required. Richer payload; still no
-- exact coords / owner email. Empty set for revoked/expired/invalid/non-member.
create function public.read_crew_shared_diary(p_token text)
returns table (
  live boolean,
  live_at timestamptz,
  species public.species,
  caption text,
  hunted_on date,
  county text,
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
      false, lat_live, null::public.species, null::text, null::date, null::text,
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
    select p.county, public.blur_point_keyed(p.centroid, sl.owner_id)
      into cty, blur
      from public.places p where p.id = place_uuid;
  end if;

  return query select
    true,
    lat_live,
    e.species,
    e.caption,
    e.hunted_on,
    cty,
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



-- ---------------------------------------------------------------------------
-- View counts (owner totals only). Flag defaults OFF until product enables it.
-- Counts table stores ONLY (link_id, view_count). No viewer identity, IP,
-- location, device, or time. Abuse IPs live in a separate short-TTL log.
-- ---------------------------------------------------------------------------
create function public.share_link_view_counts_enabled() returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select false;
$$;

create table public.share_link_view_counts (
  link_id uuid primary key references public.share_links (id) on delete cascade,
  view_count bigint not null default 0 check (view_count >= 0)
);
-- Intentionally no IP / user_agent / viewer_id / viewed_at columns.
alter table public.share_link_view_counts enable row level security;
revoke all on public.share_link_view_counts from anon, authenticated;

-- Short-term abuse log only (not counts). Purge via purge_share_link_abuse_logs().
create table public.share_link_abuse_logs (
  id bigserial primary key,
  link_id uuid references public.share_links (id) on delete set null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.share_link_abuse_logs enable row level security;
revoke all on public.share_link_abuse_logs from anon, authenticated;

create function public.purge_share_link_abuse_logs(p_older_than interval default interval '7 days')
returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.share_link_abuse_logs where created_at < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_share_link_abuse_logs(interval) from public, anon, authenticated;

-- Heuristic: bots, crawlers, and link-preview fetchers do not increment counts.
create function public.share_link_user_agent_is_bot(p_ua text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select case
    when p_ua is null or length(trim(p_ua)) = 0 then true
    when lower(p_ua) ~ '(bot|crawler|spider|crawl|slurp|scrapy|httpclient|python-requests|curl/|wget|libwww|go-http|java/|okhttp|phantom|headless|selenium|preview|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|embedly|quora link|pinterest|redditbot|applebot|bingpreview|googlebot|bingbot|yandex|baiduspider|duckduckbot|semrush|ahrefs|mj12bot|petalbot|bytespider)'
      then true
    else false
  end;
$$;

-- First-party view bump. Never stores viewer identity in the counts table.
-- Optional p_ip goes only to the short-TTL abuse log.
create function public.record_share_link_view(p_token text, p_user_agent text default null, p_ip text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  h bytea := sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  lid uuid;
  ip_addr inet;
begin
  if not public.share_link_view_counts_enabled() then
    return;
  end if;
  if public.share_link_user_agent_is_bot(p_user_agent) then
    return;
  end if;
  select s.id into lid
    from public.share_links s
   where s.token_hash = h
     and public.share_link_is_active(s.revoked_at, s.expires_at);
  if lid is null then
    return;
  end if;

  insert into public.share_link_view_counts (link_id, view_count)
  values (lid, 1)
  on conflict (link_id) do update set view_count = public.share_link_view_counts.view_count + 1;

  begin
    ip_addr := nullif(trim(coalesce(p_ip, '')), '')::inet;
  exception when others then
    ip_addr := null;
  end;
  if ip_addr is not null then
    insert into public.share_link_abuse_logs (link_id, ip, user_agent)
    values (lid, ip_addr, left(coalesce(p_user_agent, ''), 512));
  end if;
end;
$$;

revoke execute on function public.record_share_link_view(text, text, text) from public;
grant execute on function public.record_share_link_view(text, text, text) to anon, authenticated;
grant execute on function public.share_link_user_agent_is_bot(text) to anon, authenticated;
grant execute on function public.share_link_view_counts_enabled() to anon, authenticated;

-- Public share reports (no account). Stub for lawyer-held public viewer.
create table public.public_share_reports (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null,
  reason text not null check (char_length(reason) between 1 and 200),
  details text check (details is null or char_length(details) <= 1000),
  contact_email text check (contact_email is null or char_length(contact_email) <= 320),
  created_at timestamptz not null default now()
);
alter table public.public_share_reports enable row level security;
revoke all on public.public_share_reports from anon, authenticated;

create function public.report_shared_diary(
  p_token text,
  p_reason text,
  p_details text default null,
  p_contact_email text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.public_diary_share_enabled() then
    return;
  end if;
  if p_token is null or length(p_token) < 16 then
    raise exception 'invalid report' using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) < 1 then
    raise exception 'reason required' using errcode = '22023';
  end if;
  insert into public.public_share_reports (token_hash, reason, details, contact_email)
  values (
    sha256(convert_to(p_token, 'UTF8')),
    left(trim(p_reason), 200),
    nullif(left(trim(coalesce(p_details, '')), 1000), ''),
    nullif(left(trim(coalesce(p_contact_email, '')), 320), '')
  );
end;
$$;
revoke execute on function public.report_shared_diary(text, text, text, text) from public;
grant execute on function public.report_shared_diary(text, text, text, text) to anon, authenticated;

-- Recreate status now that view_counts table exists (migration order).
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
    select true, rid, r_created, r_exp, public.diary_share_live_at(hunted, created), r_aud, r_crew,
           case when public.share_link_view_counts_enabled()
                then coalesce((select c.view_count from public.share_link_view_counts c where c.link_id = rid), 0)
                else 0::bigint end;
end;
$$;

revoke execute on function public.create_diary_share_link(uuid, uuid, integer),
  public.create_public_diary_share_link(uuid, integer),
  public.revoke_diary_share_link(uuid),
  public.diary_share_status(uuid),
  public.read_crew_shared_diary(text)
  from public, anon;
grant execute on function public.create_diary_share_link(uuid, uuid, integer),
  public.create_public_diary_share_link(uuid, integer),
  public.revoke_diary_share_link(uuid),
  public.diary_share_status(uuid),
  public.read_crew_shared_diary(text)
  to authenticated;

revoke execute on function public.public_diary_share_enabled() from public;
grant execute on function public.public_diary_share_enabled() to anon, authenticated;

revoke execute on function public.read_shared_diary(text) from public;
grant execute on function public.read_shared_diary(text) to anon, authenticated;

revoke execute on function public.guard_share_link_immutable(),
  public.diary_share_live_at(date, timestamptz),
  public.share_link_is_active(timestamptz, timestamptz)
  from public, anon, authenticated;
