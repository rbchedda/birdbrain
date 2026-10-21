-- Rich private diary entries (spec §3.2): dogs, cover, hours, miles, flushes,
-- shots, birds per species, manual weather, notes and private photos.
-- One row per hunt_log_entries row; owner-only, never public.

create function public.valid_diary_details(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(d) = 'object'
    and coalesce((d ->> 'hours')::numeric, 0) between 0 and 24
    and coalesce((d ->> 'miles')::numeric, 0) between 0 and 100
    and coalesce((d ->> 'flushes')::numeric, 0) >= 0
    and coalesce((d ->> 'shots')::numeric, 0) >= 0
    and (d ->> 'startTime' is null or d ->> 'startTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    and coalesce(jsonb_typeof(d -> 'cover'), 'array') = 'array'
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(d -> 'cover', '[]'::pg_catalog.jsonb)) c
      where c not in ('grass', 'cut_corn', 'standing_corn', 'brush', 'young_forest', 'timber', 'marsh', 'field_edge')
    )
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(d -> 'species', '[]'::pg_catalog.jsonb)) s
      where s not in ('pheasant', 'dove', 'turkey', 'grouse', 'waterfowl')
    )
$$;

create table public.diary_entries (
  entry_id uuid primary key references public.hunt_log_entries (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  details jsonb not null default '{}'::jsonb check (public.valid_diary_details(details)),
  updated_at timestamptz not null default now()
);

alter table public.diary_entries enable row level security;
revoke all on public.diary_entries from anon;

create policy diary_select_own on public.diary_entries
  for select to authenticated using (owner_id = auth.uid());
create policy diary_insert_own on public.diary_entries
  for insert to authenticated with check (
    owner_id = auth.uid()
    and exists (select 1 from public.hunt_log_entries e where e.id = entry_id and e.owner_id = auth.uid())
  );
create policy diary_update_own on public.diary_entries
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy diary_delete_own on public.diary_entries
  for delete to authenticated using (owner_id = auth.uid());

-- Private photo bucket: objects live under <user_id>/<entry client_id>/<file>.
-- Only the owner can read, write or delete them. Clients strip EXIF/GPS first.
insert into storage.buckets (id, name, public)
values ('diary-photos', 'diary-photos', false)
on conflict (id) do nothing;

create policy "owners read their diary photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners upload diary photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners replace diary photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete diary photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'diary-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Same contract as upsert_hunt_log_entry (idempotent by client_id, optimistic
-- concurrency on version), plus the diary details. p_details null = no details.
create function public.upsert_diary_entry(
  p_client_id uuid,
  p_base_version integer,
  p_species public.species,
  p_caption text,
  p_hunted_on date,
  p_place_counts jsonb,
  p_details jsonb
) returns table (version integer, conflict boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  cur public.hunt_log_entries;
  cur_details pg_catalog.jsonb;
  same pg_catalog.bool;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_details -> 'photos', '[]'::pg_catalog.jsonb)) p
    where p ->> 'path' is not null and split_part(p ->> 'path', '/', 1) <> auth.uid()::text
  ) then
    raise exception 'photo path outside your folder' using errcode = '42501';
  end if;

  select * into cur from public.hunt_log_entries e where e.client_id = p_client_id for update;
  if not found then
    insert into public.hunt_log_entries (owner_id, client_id, species, caption, hunted_on, place_counts)
    values (auth.uid(), p_client_id, p_species, coalesce(p_caption, ''), p_hunted_on, coalesce(p_place_counts, '[]'::pg_catalog.jsonb))
    on conflict (client_id) do nothing
    returning id into new_id;
    if new_id is not null then
      if p_details is not null then
        insert into public.diary_entries (entry_id, owner_id, details) values (new_id, auth.uid(), p_details);
      end if;
      return query select 1, false;
      return;
    end if;
    select * into cur from public.hunt_log_entries e where e.client_id = p_client_id for update;
    if not found then
      raise exception 'client_id already in use' using errcode = '23505';
    end if;
  end if;

  select d.details into cur_details from public.diary_entries d where d.entry_id = cur.id;
  same := cur.species is not distinct from p_species
    and cur.caption = coalesce(p_caption, '')
    and cur.hunted_on is not distinct from p_hunted_on
    and cur.place_counts = coalesce(p_place_counts, '[]'::pg_catalog.jsonb)
    and cur_details is not distinct from p_details;

  if same then
    return query select cur.version, false;
  elsif p_base_version is not null and p_base_version = cur.version then
    update public.hunt_log_entries e
       set species = p_species, caption = coalesce(p_caption, ''), hunted_on = p_hunted_on,
           place_counts = coalesce(p_place_counts, '[]'::pg_catalog.jsonb), version = cur.version + 1
     where e.id = cur.id;
    if p_details is null then
      delete from public.diary_entries d where d.entry_id = cur.id;
    else
      insert into public.diary_entries (entry_id, owner_id, details) values (cur.id, auth.uid(), p_details)
      on conflict (entry_id) do update set details = excluded.details, updated_at = pg_catalog.now();
    end if;
    return query select cur.version + 1, false;
  else
    return query select cur.version, true;
  end if;
end $$;

revoke execute on function public.upsert_diary_entry(uuid, integer, public.species, text, date, jsonb, jsonb) from public, anon;
grant execute on function public.upsert_diary_entry(uuid, integer, public.species, text, date, jsonb, jsonb) to authenticated;

-- Account deletion also clears the private diary photos (best-effort in SQL,
-- like post-photos; diary rows themselves cascade from auth.users).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  update public.groups set created_by = null where created_by = uid;

  begin
    delete from storage.objects
     where bucket_id in ('post-photos', 'diary-photos') and (storage.foldername(name))[1] = uid::text;
  exception when others then
    raise warning 'delete_my_account: storage objects not removed in SQL (%); client removes them via the Storage API', sqlerrm;
  end;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
