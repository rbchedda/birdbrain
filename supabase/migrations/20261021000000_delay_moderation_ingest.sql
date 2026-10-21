-- BirdBrain v0.2: game-law delay, moderation basics, ingest bookkeeping.
--
-- 1. Delayed posts. PA law bars using phones to alert another hunter to live
--    game, so other users only see a post from the next calendar day
--    (America/New_York) after it was created. Authors always see their own.
-- 2. Blocking and reporting, which Apple requires for user-generated content
--    (App Review Guideline 1.2), including TestFlight external betas.
-- 3. ingest_state, so ingestion jobs can skip layers that haven't changed.

-- ---------------------------------------------------------------------------
-- 1. Delayed visibility
-- ---------------------------------------------------------------------------

alter table public.posts add column public_after timestamptz;

-- Midnight Eastern on the day after ts.
create function public.next_day_et(ts timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select ((ts at time zone 'America/New_York')::date + 1)::timestamp at time zone 'America/New_York';
$$;

update public.posts set public_after = public.next_day_et(created_at);
alter table public.posts alter column public_after set not null;

-- Clients can't choose public_after (it isn't in the column grants), and the
-- trigger sets it on insert so a client-supplied created_at can't shortcut it.
create function public.set_post_public_after() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.public_after := public.next_day_et(new.created_at);
  return new;
end;
$$;

create trigger posts_set_public_after before insert on public.posts
  for each row execute function public.set_post_public_after();

-- ---------------------------------------------------------------------------
-- 2. Blocking
-- ---------------------------------------------------------------------------

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

create policy "users manage their own blocks" on public.user_blocks
  for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- True if either user has blocked the other. Security definer so it can see
-- blocks the caller didn't create (the caller still never sees the rows).
create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_blocks
     where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- Post visibility: own posts always; others' after the delay and if not blocked.
create function public.can_see_post(p_author uuid, p_public_after timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_author = auth.uid()
      or (p_public_after <= now() and not public.is_blocked_between(auth.uid(), p_author));
$$;

drop policy "posts are visible to signed-in users" on public.posts;
create policy "posts are visible after the delay, unless blocked" on public.posts
  for select to authenticated using (public.can_see_post(author_id, public_after));

-- Comments and likes follow their post's visibility.
create function public.can_see_post_id(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
     where p.id = pid and public.can_see_post(p.author_id, p.public_after)
  );
$$;

drop policy "comments are visible to signed-in users" on public.comments;
create policy "comments are visible on visible posts, unless blocked" on public.comments
  for select to authenticated
  using (public.can_see_post_id(post_id) and not public.is_blocked_between(auth.uid(), author_id));

drop policy "users comment as themselves" on public.comments;
create policy "users comment as themselves on visible posts" on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_post_id(post_id));

drop policy "likes are visible to signed-in users" on public.likes;
create policy "likes are visible on visible posts" on public.likes
  for select to authenticated using (public.can_see_post_id(post_id));

drop policy "users like as themselves" on public.likes;
create policy "users like visible posts as themselves" on public.likes
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_post_id(post_id));

-- ---------------------------------------------------------------------------
-- 2b. Reporting
-- ---------------------------------------------------------------------------

create type public.report_reason as enum (
  'spam', 'harassment', 'graphic', 'illegal_activity', 'live_game_alert', 'location_exposed', 'other'
);
create type public.report_status as enum ('open', 'actioned', 'dismissed');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  reason public.report_reason not null,
  details text check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  -- Exactly one target.
  check (num_nonnulls(post_id, comment_id, profile_id) = 1)
);
create index reports_open_idx on public.reports (status, created_at) where status = 'open';

alter table public.reports enable row level security;

-- Users file and see their own reports; moderators work with the service role.
create policy "users file reports as themselves" on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open' and reviewed_at is null);
create policy "users see their own reports" on public.reports
  for select to authenticated using (reporter_id = auth.uid());

revoke insert, update on public.reports from anon, authenticated;
grant insert (reporter_id, post_id, comment_id, profile_id, reason, details)
  on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ingest bookkeeping (service role only; RLS on with no policies)
-- ---------------------------------------------------------------------------

create table public.ingest_state (
  source text primary key,
  layer_url text not null,
  last_edit_date timestamptz,
  feature_count integer,
  last_run_at timestamptz not null default now()
);
alter table public.ingest_state enable row level security;

-- The 2023 PASDA copy of the game lands is replaced by the live PGC layer
-- (ingest/arcgis.mjs, source 'pgc:state_game_lands'). Pre-beta, so dropping
-- the old rows (and any saved_places pointing at them) is acceptable.
delete from public.places where source = 'pasda:pgc_state_game_lands';
