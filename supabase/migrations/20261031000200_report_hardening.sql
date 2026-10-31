-- Audit lows: report-autohide-brigading and ugc-filter-and-report-coverage-gaps.
-- Rollback: supabase/rollbacks/20261031000200_report_hardening.down.sql

-- ---------------------------------------------------------------------------
-- 1. Only established accounts count toward auto-hide
-- ---------------------------------------------------------------------------
-- A reporter counts only if the account is not anonymous and is at least
-- moderation_min_reporter_age() old (auth.users.created_at, server-set; the
-- profiles.created_at column is client-writable so it isn't used). Brand-new
-- throwaway accounts' reports are still stored for moderators.
create function public.moderation_min_reporter_age() returns interval
language sql immutable set search_path = '' as $$
  select interval '3 days';
$$;

create function public.moderation_daily_report_cap() returns integer
language sql immutable set search_path = '' as $$
  select 20;
$$;

create or replace function public.hide_reported_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if new.post_id is not null then
    select count(distinct r.reporter_id) into n
      from public.reports r join auth.users u on u.id = r.reporter_id
     where r.post_id = new.post_id and r.status = 'open'
       and not coalesce(u.is_anonymous, false)
       and u.created_at <= now() - public.moderation_min_reporter_age();
    if n >= public.moderation_report_threshold() then
      update public.posts set hidden_at = now() where id = new.post_id and hidden_at is null;
    end if;
  elsif new.comment_id is not null then
    select count(distinct r.reporter_id) into n
      from public.reports r join auth.users u on u.id = r.reporter_id
     where r.comment_id = new.comment_id and r.status = 'open'
       and not coalesce(u.is_anonymous, false)
       and u.created_at <= now() - public.moderation_min_reporter_age();
    if n >= public.moderation_report_threshold() then
      update public.comments set hidden_at = now() where id = new.comment_id and hidden_at is null;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Per-user daily report cap (rolling 24 h). Service role is exempt.
-- ---------------------------------------------------------------------------
-- Security invoker on purpose: current_user must be the client role, and the
-- reporter can read their own reports under RLS.
create function public.guard_report_rate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('reports:' || new.reporter_id::text));
  if (select count(*) from public.reports r
       where r.reporter_id = new.reporter_id and r.created_at > now() - interval '24 hours')
     >= public.moderation_daily_report_cap() then
    raise exception 'report limit reached: try again tomorrow'
      using errcode = 'P0001', hint = 'You can file a limited number of reports per day.';
  end if;
  return new;
end;
$$;
create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.guard_report_rate();
create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. Group reporting
-- ---------------------------------------------------------------------------
alter table public.reports add column group_id uuid references public.groups (id) on delete cascade;
alter table public.reports drop constraint reports_check;
alter table public.reports add constraint reports_one_target
  check (num_nonnulls(post_id, comment_id, profile_id, group_id) = 1);
create unique index reports_one_open_per_group on public.reports (reporter_id, group_id)
  where group_id is not null and status = 'open';
grant insert (group_id) on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Objectionable filter covers usernames, display names, group names/descriptions
-- ---------------------------------------------------------------------------
create or replace function public.reject_objectionable() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  j jsonb := to_jsonb(new);
  cols text[];
  c text;
begin
  cols := case tg_table_name
    when 'posts' then array['caption']
    when 'comments' then array['body']
    when 'profiles' then array['username', 'display_name']
    when 'groups' then array['name', 'description']
    else array[]::text[] end;
  foreach c in array cols loop
    if public.contains_objectionable(j ->> c) then
      raise exception 'objectionable content: this breaks the community rules'
        using errcode = 'P0001', hint = 'Remove slurs or explicit language and try again.';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.contains_objectionable(text) from public, anon, authenticated;
revoke execute on function public.guard_report_rate() from public, anon, authenticated;

create trigger profiles_reject_objectionable before insert or update of username, display_name on public.profiles
  for each row execute function public.reject_objectionable();
create trigger groups_reject_objectionable before insert or update of name, description on public.groups
  for each row execute function public.reject_objectionable();
