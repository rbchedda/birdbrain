-- Offline-safe hunt log: private journal entries synced from the device.
-- Owner-only: never readable by anyone but the owner, never public.
create table public.hunt_log_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- UUID minted on the device; makes every upload idempotent.
  client_id uuid not null unique,
  species public.species,
  caption text not null default '' check (char_length(caption) <= 2000),
  hunted_on date,
  place_counts jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hunt_log_entries_owner_idx on public.hunt_log_entries (owner_id, hunted_on desc);

alter table public.hunt_log_entries enable row level security;
revoke all on public.hunt_log_entries from anon;

create policy hunt_log_select_own on public.hunt_log_entries
  for select to authenticated using (owner_id = auth.uid());
create policy hunt_log_insert_own on public.hunt_log_entries
  for insert to authenticated with check (owner_id = auth.uid());
create policy hunt_log_update_own on public.hunt_log_entries
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy hunt_log_delete_own on public.hunt_log_entries
  for delete to authenticated using (owner_id = auth.uid());

-- Owner and client_id never change after insert.
create function public.hunt_log_entries_guard() returns trigger language plpgsql as $$
begin
  if new.owner_id <> old.owner_id or new.client_id <> old.client_id then
    raise exception 'owner_id and client_id are immutable';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger hunt_log_entries_guard before update on public.hunt_log_entries
  for each row execute function public.hunt_log_entries_guard();

-- Idempotent upsert by client_id with optimistic concurrency.
-- p_base_version: the server version the device last saw (null if never synced).
-- Returns conflict = true (and writes nothing) when the server row moved on and
-- differs from what the device sends. Re-sending identical content is a no-op.
create function public.upsert_hunt_log_entry(
  p_client_id uuid,
  p_base_version integer,
  p_species public.species,
  p_caption text,
  p_hunted_on date,
  p_place_counts jsonb
) returns table (version integer, conflict boolean)
language plpgsql security invoker set search_path = public as $$
declare
  cur public.hunt_log_entries;
  same boolean;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into cur from public.hunt_log_entries e where e.client_id = p_client_id for update;
  if not found then
    insert into public.hunt_log_entries (owner_id, client_id, species, caption, hunted_on, place_counts)
    values (auth.uid(), p_client_id, p_species, coalesce(p_caption, ''), p_hunted_on, coalesce(p_place_counts, '[]'::jsonb))
    on conflict (client_id) do nothing;
    if found then
      return query select 1, false;
      return;
    end if;
    -- Lost a race with a concurrent insert, or the id belongs to someone else (invisible under RLS).
    select * into cur from public.hunt_log_entries e where e.client_id = p_client_id for update;
    if not found then
      raise exception 'client_id already in use' using errcode = '23505';
    end if;
  end if;

  same := cur.species is not distinct from p_species
    and cur.caption = coalesce(p_caption, '')
    and cur.hunted_on is not distinct from p_hunted_on
    and cur.place_counts = coalesce(p_place_counts, '[]'::jsonb);

  if same then
    return query select cur.version, false;
  elsif p_base_version is not null and p_base_version = cur.version then
    update public.hunt_log_entries e
       set species = p_species, caption = coalesce(p_caption, ''), hunted_on = p_hunted_on,
           place_counts = coalesce(p_place_counts, '[]'::jsonb), version = cur.version + 1
     where e.id = cur.id;
    return query select cur.version + 1, false;
  else
    return query select cur.version, true;
  end if;
end $$;

revoke execute on function public.upsert_hunt_log_entry(uuid, integer, public.species, text, date, jsonb) from public, anon;
grant execute on function public.upsert_hunt_log_entry(uuid, integer, public.species, text, date, jsonb) to authenticated;
