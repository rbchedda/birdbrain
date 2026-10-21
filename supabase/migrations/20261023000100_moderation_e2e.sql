-- Moderation end to end (App Review Guideline 1.2), filling gaps left by
-- 20261021000000_delay_moderation_ingest.sql. Already in place there and kept:
-- user_blocks + is_blocked_between (posts, comments, likes and photos hidden in
-- both directions), reports with reasons and an open/actioned/dismissed status.
--
-- Added here:
-- 1. A 'hate' report reason, and one open report per reporter per target so a
--    single user can't trip the auto-hide alone.
-- 2. Hidden pending review: once moderation_report_threshold() distinct users
--    report a post or comment, it gets hidden_at and disappears for everyone
--    but its author until a moderator (service role) clears it.
-- 3. A server-side blocklist: posts.caption and comments.body containing a
--    blocklisted term are rejected on insert and update.
-- 4. profiles.rules_accepted_at, set once via accept_community_rules().

-- ---------------------------------------------------------------------------
-- 1. Report reasons and duplicates
-- ---------------------------------------------------------------------------

alter type public.report_reason add value if not exists 'hate';

create unique index reports_one_open_per_post on public.reports (reporter_id, post_id)
  where post_id is not null and status = 'open';
create unique index reports_one_open_per_comment on public.reports (reporter_id, comment_id)
  where comment_id is not null and status = 'open';
create unique index reports_one_open_per_profile on public.reports (reporter_id, profile_id)
  where profile_id is not null and status = 'open';

-- ---------------------------------------------------------------------------
-- 2. Hidden pending review
-- ---------------------------------------------------------------------------

-- Not in any client column grant, so only triggers and the service role set it.
alter table public.posts add column hidden_at timestamptz;
alter table public.comments add column hidden_at timestamptz;

create function public.moderation_report_threshold() returns integer
language sql immutable set search_path = '' as $$
  select 3;
$$;

create function public.hide_reported_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if new.post_id is not null then
    select count(distinct reporter_id) into n from public.reports
     where post_id = new.post_id and status = 'open';
    if n >= public.moderation_report_threshold() then
      update public.posts set hidden_at = now() where id = new.post_id and hidden_at is null;
    end if;
  elsif new.comment_id is not null then
    select count(distinct reporter_id) into n from public.reports
     where comment_id = new.comment_id and status = 'open';
    if n >= public.moderation_report_threshold() then
      update public.comments set hidden_at = now() where id = new.comment_id and hidden_at is null;
    end if;
  end if;
  return new;
end;
$$;

create trigger reports_hide_reported after insert on public.reports
  for each row execute function public.hide_reported_content();

-- Visibility now also requires "not hidden" for anyone but the author.
-- can_see_post(author, public_after) keeps its signature for existing callers;
-- the hidden check is added where a row is available.
create function public.can_see_post_row(p_author uuid, p_public_after timestamptz, p_hidden_at timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_author = auth.uid()
      or (p_hidden_at is null and public.can_see_post(p_author, p_public_after));
$$;

drop policy "posts are visible after the delay, unless blocked" on public.posts;
create policy "posts are visible after the delay, unless blocked or hidden" on public.posts
  for select to authenticated using (public.can_see_post_row(author_id, public_after, hidden_at));

create or replace function public.can_see_post_id(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
     where p.id = pid and public.can_see_post_row(p.author_id, p.public_after, p.hidden_at)
  );
$$;

create or replace function public.can_read_post_photo(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
     where p.photo_path = object_name
       and (storage.foldername(object_name))[1] = p.author_id::text
       and public.can_see_post_row(p.author_id, p.public_after, p.hidden_at)
  );
$$;

drop policy "comments are visible after their own delay, unless blocked" on public.comments;
create policy "comments are visible after their own delay, unless blocked or hidden" on public.comments
  for select to authenticated
  using (
    public.can_see_post_id(post_id)
    and (
      author_id = auth.uid()
      or (public_after <= now() and hidden_at is null and not public.is_blocked_between(auth.uid(), author_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Objectionable-content filter
-- ---------------------------------------------------------------------------

-- Service role maintains the list; RLS on with no policies hides it from clients.
create table public.blocklist_terms (
  term text primary key check (term = lower(term) and term ~ '^[a-z0-9 ]+$'),
  created_at timestamptz not null default now()
);
alter table public.blocklist_terms enable row level security;

-- Seed list: slurs and explicit terms. Extend with the service role.
insert into public.blocklist_terms (term) values
  ('fuck'), ('fucking'), ('motherfucker'), ('cunt'), ('nigger'), ('nigga'), ('faggot'), ('fag'),
  ('retard'), ('kike'), ('spic'), ('chink'), ('wetback'), ('tranny'), ('whore'), ('slut');

-- Whole-word, case-insensitive match after collapsing non-letters to spaces,
-- so "F.U.C.K"-style spacing isn't covered but "Fuck!" and "FUCKING" are.
create function public.contains_objectionable(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select t is not null and exists (
    select 1 from public.blocklist_terms b
     where ' ' || regexp_replace(lower(t), '[^a-z0-9]+', ' ', 'g') || ' ' like '% ' || b.term || ' %'
  );
$$;

create function public.reject_objectionable() returns trigger
language plpgsql set search_path = '' as $$
declare
  t text;
begin
  -- Read the column via jsonb so one function serves both tables.
  t := to_jsonb(new) ->> (case tg_table_name when 'posts' then 'caption' else 'body' end);
  if public.contains_objectionable(t) then
    raise exception 'objectionable content: this breaks the community rules'
      using errcode = 'P0001', hint = 'Remove slurs or explicit language and try again.';
  end if;
  return new;
end;
$$;

create trigger posts_reject_objectionable before insert or update of caption on public.posts
  for each row execute function public.reject_objectionable();
create trigger comments_reject_objectionable before insert or update of body on public.comments
  for each row execute function public.reject_objectionable();

-- ---------------------------------------------------------------------------
-- 4. Community rules acceptance
-- ---------------------------------------------------------------------------

alter table public.profiles add column rules_accepted_at timestamptz;

create function public.accept_community_rules() returns timestamptz
language sql volatile security definer set search_path = '' as $$
  update public.profiles set rules_accepted_at = coalesce(rules_accepted_at, now())
   where id = auth.uid()
  returning rules_accepted_at;
$$;
revoke execute on function public.accept_community_rules() from public, anon;
grant execute on function public.accept_community_rules() to authenticated;
