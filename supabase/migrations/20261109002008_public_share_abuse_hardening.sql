-- Repo L6 / L7 (flags stay OFF): harden the public-share RPCs before they
-- can be enabled. public_diary_share_enabled() and
-- share_link_view_counts_enabled() are not changed and still return false.
-- - report_shared_diary requires a token that exists on share_links
-- - per-token, per-hour caps on reports and view increments
-- - viewer IP is taken from request headers (cf-connecting-ip,
--   x-forwarded-for, x-real-ip); p_ip is kept on the signature so the
--   web/share caller still compiles, but it is ignored
-- - purge_share_retention() deletes old abuse logs and nulls stale
--   public_share_reports.contact_email (pg_cron is not in the repo; schedule
--   is documented in /workspace/hosted-changes-needed.md)
-- - read_shared_diary returns county only for the public audience
--   (blurred_lng/blurred_lat stay in the return type, always null)
-- Rollback: supabase/rollbacks/20261109002008_public_share_abuse_hardening.down.sql

create function private.request_client_ip() returns inet
language plpgsql stable set search_path = '' as $$
declare
  raw text;
  headers jsonb;
  candidate text;
begin
  raw := current_setting('request.headers', true);
  if raw is null or raw = '' then
    return null;
  end if;
  begin
    headers := raw::jsonb;
  exception when others then
    return null;
  end;
  candidate := nullif(trim(coalesce(headers->>'cf-connecting-ip', '')), '');
  if candidate is null then
    candidate := nullif(trim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)), '');
  end if;
  if candidate is null then
    candidate := nullif(trim(coalesce(headers->>'x-real-ip', '')), '');
  end if;
  if candidate is null then
    return null;
  end if;
  begin
    return candidate::inet;
  exception when others then
    return null;
  end;
end;
$$;
revoke all on function private.request_client_ip() from public, anon, authenticated;

-- Caps used by the RPCs. Not granted to clients.
create function public.share_report_hourly_cap() returns integer
language sql immutable parallel safe set search_path = '' as $$
  select 10;
$$;
create function public.share_view_hourly_cap() returns integer
language sql immutable parallel safe set search_path = '' as $$
  select 60;
$$;
revoke execute on function public.share_report_hourly_cap(), public.share_view_hourly_cap()
  from public, anon, authenticated;

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
    select p.county into cty from public.places p where p.id = place_uuid;
  end if;

  -- Public audience: county only. Columns kept for API compatibility; blur is null.
  return query select true, cty, null::double precision, null::double precision;
end;
$$;
revoke execute on function public.read_shared_diary(text) from public;
grant execute on function public.read_shared_diary(text) to anon, authenticated;

create or replace function public.record_share_link_view(p_token text, p_user_agent text default null, p_ip text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  h bytea := sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  lid uuid;
  ip_addr inet;
  cap integer := public.share_view_hourly_cap();
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

  -- p_ip is ignored (spoofable). IP comes from the request, if present.
  ip_addr := private.request_client_ip();

  if (
    select count(*) from public.share_link_abuse_logs a
     where a.link_id = lid and a.created_at > now() - interval '1 hour'
  ) >= cap then
    return;
  end if;

  insert into public.share_link_view_counts (link_id, view_count)
  values (lid, 1)
  on conflict (link_id) do update set view_count = public.share_link_view_counts.view_count + 1;

  insert into public.share_link_abuse_logs (link_id, ip, user_agent)
  values (lid, ip_addr, left(coalesce(p_user_agent, ''), 512));
end;
$$;
revoke execute on function public.record_share_link_view(text, text, text) from public;
grant execute on function public.record_share_link_view(text, text, text) to anon, authenticated;

create or replace function public.report_shared_diary(
  p_token text,
  p_reason text,
  p_details text default null,
  p_contact_email text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h bytea;
  cap integer := public.share_report_hourly_cap();
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
  h := sha256(convert_to(p_token, 'UTF8'));
  if not exists (select 1 from public.share_links s where s.token_hash = h) then
    raise exception 'invalid report' using errcode = '22023';
  end if;
  if (
    select count(*) from public.public_share_reports r
     where r.token_hash = h and r.created_at > now() - interval '1 hour'
  ) >= cap then
    raise exception 'invalid report' using errcode = '22023';
  end if;
  insert into public.public_share_reports (token_hash, reason, details, contact_email)
  values (
    h,
    left(trim(p_reason), 200),
    nullif(left(trim(coalesce(p_details, '')), 1000), ''),
    nullif(left(trim(coalesce(p_contact_email, '')), 320), '')
  );
end;
$$;
revoke execute on function public.report_shared_diary(text, text, text, text) from public;
grant execute on function public.report_shared_diary(text, text, text, text) to anon, authenticated;

-- Combined retention: 7-day abuse-log TTL (same default as before) and
-- 30-day contact_email scrub. Call from an ops job; pg_cron is not installed.
create function public.purge_share_retention(
  p_abuse_older_than interval default interval '7 days',
  p_email_older_than interval default interval '30 days'
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n_logs integer := 0;
  n_emails integer := 0;
begin
  n_logs := public.purge_share_link_abuse_logs(p_abuse_older_than);
  update public.public_share_reports
     set contact_email = null
   where contact_email is not null
     and created_at < now() - p_email_older_than;
  get diagnostics n_emails = row_count;
  return n_logs + n_emails;
end;
$$;
revoke all on function public.purge_share_retention(interval, interval) from public, anon, authenticated;
