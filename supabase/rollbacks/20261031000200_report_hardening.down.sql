drop trigger if exists groups_reject_objectionable on public.groups;
drop trigger if exists profiles_reject_objectionable on public.profiles;
create or replace function public.reject_objectionable() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t text;
begin
  t := to_jsonb(new) ->> (case tg_table_name when 'posts' then 'caption' else 'body' end);
  if public.contains_objectionable(t) then
    raise exception 'objectionable content: this breaks the community rules'
      using errcode = 'P0001', hint = 'Remove slurs or explicit language and try again.';
  end if;
  return new;
end;
$$;
-- (security definer stays until 20261031000000's rollback runs.)
delete from public.reports where group_id is not null;
drop index if exists public.reports_one_open_per_group;
alter table public.reports drop constraint if exists reports_one_target;
alter table public.reports drop column if exists group_id;
alter table public.reports add constraint reports_check check (num_nonnulls(post_id, comment_id, profile_id) = 1);
drop trigger if exists reports_rate_limit on public.reports;
drop index if exists public.reports_reporter_created_idx;
drop function if exists public.guard_report_rate();
create or replace function public.hide_reported_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if new.post_id is not null then
    select count(distinct r.reporter_id) into n
      from public.reports r join auth.users u on u.id = r.reporter_id
     where r.post_id = new.post_id and r.status = 'open' and not coalesce(u.is_anonymous, false);
    if n >= public.moderation_report_threshold() then
      update public.posts set hidden_at = now() where id = new.post_id and hidden_at is null;
    end if;
  elsif new.comment_id is not null then
    select count(distinct r.reporter_id) into n
      from public.reports r join auth.users u on u.id = r.reporter_id
     where r.comment_id = new.comment_id and r.status = 'open' and not coalesce(u.is_anonymous, false);
    if n >= public.moderation_report_threshold() then
      update public.comments set hidden_at = now() where id = new.comment_id and hidden_at is null;
    end if;
  end if;
  return new;
end;
$$;
drop function if exists public.moderation_daily_report_cap();
drop function if exists public.moderation_min_reporter_age();
