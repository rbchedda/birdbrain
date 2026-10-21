-- BirdBrain v0.3: per-place bird counts for the after-the-hunt log.
--
-- Which spot a hunter worked is as sensitive as an exact location, so the
-- per-place breakdown is owner-only, like post_locations. Everyone else sees
-- only the totals, which a trigger copies into posts.counts. Additive only.

alter table public.posts
  add column counts jsonb not null default '{}';

comment on column public.posts.counts is
  'Totals derived from post_place_counts by trigger, e.g. {"flushed": 6, "roosters": 3, "harvested": 2}. Never written by clients.';

create table public.post_place_counts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  -- Set null (not cascade) so a re-ingest that drops a place keeps the totals.
  place_id uuid references public.places (id) on delete set null,
  flushed integer not null default 0 check (flushed between 0 and 999),
  roosters integer not null default 0 check (roosters between 0 and 999),
  harvested integer not null default 0 check (harvested between 0 and 999),
  created_at timestamptz not null default now(),
  unique (post_id, place_id)
);
create index post_place_counts_place_idx on public.post_place_counts (place_id);

alter table public.post_place_counts enable row level security;

create policy "authors manage per-place counts" on public.post_place_counts
  for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

create function public.sync_post_counts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts p
     set counts = coalesce((
       select jsonb_build_object(
                'flushed', sum(c.flushed),
                'roosters', sum(c.roosters),
                'harvested', sum(c.harvested))
         from public.post_place_counts c
        where c.post_id = target
       having count(*) > 0), '{}')
   where p.id = target;
  -- A row moved to another post: refresh the old one too.
  if tg_op = 'UPDATE' and old.post_id <> new.post_id then
    update public.posts p
       set counts = coalesce((
         select jsonb_build_object(
                  'flushed', sum(c.flushed),
                  'roosters', sum(c.roosters),
                  'harvested', sum(c.harvested))
           from public.post_place_counts c
          where c.post_id = old.post_id
         having count(*) > 0), '{}')
     where p.id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_place_counts_sync after insert or update or delete on public.post_place_counts
  for each row execute function public.sync_post_counts();

-- posts.counts isn't in the column grants from the initial schema, so clients
-- can read it but never write it. Re-state that explicitly for clarity.
revoke insert (counts), update (counts) on public.posts from anon, authenticated;
