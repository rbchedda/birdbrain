drop function if exists public.purge_share_retention(interval, interval);
drop function if exists public.share_report_hourly_cap();
drop function if exists public.share_view_hourly_cap();
drop function if exists private.request_client_ip();

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

create or replace function public.record_share_link_view(p_token text, p_user_agent text default null, p_ip text default null)
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

create or replace function public.report_shared_diary(
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

revoke execute on function public.read_shared_diary(text) from public;
grant execute on function public.read_shared_diary(text) to anon, authenticated;
revoke execute on function public.record_share_link_view(text, text, text) from public;
grant execute on function public.record_share_link_view(text, text, text) to anon, authenticated;
revoke execute on function public.report_shared_diary(text, text, text, text) from public;
grant execute on function public.report_shared_diary(text, text, text, text) to anon, authenticated;
