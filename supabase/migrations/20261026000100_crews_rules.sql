-- Crews follow-up: guests can't create or join, 25-member cap, invites fixed at
-- 7 days with at most 10 active per crew, the last admin leaving promotes the
-- longest-standing member (or deletes an empty crew), and crew posts are
-- flagged so community lists and any public aggregate can exclude them.

-- ---------------------------------------------------------------------------
-- Guests
-- ---------------------------------------------------------------------------
create function public.is_guest() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
      or coalesce((select u.is_anonymous from auth.users u where u.id = auth.uid()), false);
$$;
revoke execute on function public.is_guest() from public, anon;
grant execute on function public.is_guest() to authenticated;

-- ---------------------------------------------------------------------------
-- Member cap (25), enforced on every insert into a crew. The crew's groups row
-- is locked first, so concurrent joins serialize and can't both take the last seat.
-- ---------------------------------------------------------------------------
create function public.crew_member_cap() returns integer
language sql immutable set search_path = '' as $$ select 25 $$;

create function public.guard_crew_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  perform 1 from public.groups g where g.id = new.group_id and g.kind = 'crew' for update;
  if not found then
    return new;
  end if;
  select count(*) into n from public.group_members m where m.group_id = new.group_id;
  if n >= public.crew_member_cap() then
    raise exception 'crew is full' using errcode = 'P0001', hint = 'crew_full';
  end if;
  return new;
end;
$$;
create trigger group_members_crew_capacity before insert on public.group_members
  for each row execute function public.guard_crew_capacity();

-- ---------------------------------------------------------------------------
-- Last admin leaves: promote the longest-standing member (earliest joined_at,
-- then lowest user_id). Last member leaves: delete the crew. A trigger, so it
-- also covers account deletion and direct deletes of one's own row.
-- ---------------------------------------------------------------------------
create function public.crew_after_member_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  heir uuid;
begin
  -- Crew already gone (cascade from deleting the group) or not a crew.
  perform 1 from public.groups g where g.id = old.group_id and g.kind = 'crew' for update;
  if not found then
    return null;
  end if;
  if not exists (select 1 from public.group_members m where m.group_id = old.group_id) then
    delete from public.groups g where g.id = old.group_id;
    return null;
  end if;
  if not exists (select 1 from public.group_members m where m.group_id = old.group_id and m.role = 'admin') then
    select m.user_id into heir from public.group_members m
     where m.group_id = old.group_id
     order by m.joined_at, m.user_id
     limit 1;
    update public.group_members m set role = 'admin' where m.group_id = old.group_id and m.user_id = heir;
  end if;
  return null;
end;
$$;
create trigger group_members_crew_succession after delete on public.group_members
  for each row execute function public.crew_after_member_delete();

-- Demoting the last admin would leave a crew without one; refuse it.
create function public.guard_last_crew_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and new.role <> 'admin' and public.is_crew(old.group_id)
     and not exists (select 1 from public.group_members m
                      where m.group_id = old.group_id and m.role = 'admin' and m.user_id <> old.user_id) then
    raise exception 'a crew needs an admin' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger group_members_last_admin before update of role on public.group_members
  for each row execute function public.guard_last_crew_admin();

-- Leave a crew (or species group). Returns what happened to the crew:
-- 'left', 'promoted' (someone else became admin) or 'deleted'.
create function public.leave_crew(gid uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  was_admin boolean;
  sole_admin boolean;
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  perform 1 from public.groups g where g.id = gid for update;
  select m.role = 'admin' into was_admin from public.group_members m where m.group_id = gid and m.user_id = uid;
  if was_admin is null then
    return 'left';
  end if;
  sole_admin := was_admin and not exists (
    select 1 from public.group_members m where m.group_id = gid and m.role = 'admin' and m.user_id <> uid);
  delete from public.group_members m where m.group_id = gid and m.user_id = uid;
  if not exists (select 1 from public.groups g where g.id = gid) then
    return 'deleted';
  end if;
  return case when sole_admin then 'promoted' else 'left' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: guests refused; invites always 7 days; at most 10 active per crew.
-- ---------------------------------------------------------------------------
create or replace function public.create_crew(crew_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if public.is_guest() then
    raise exception 'create an account to start a crew' using errcode = '42501', hint = 'guest';
  end if;
  insert into public.groups (slug, name, kind, is_official, created_by)
  values ('crew-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), btrim(crew_name), 'crew', false, uid)
  returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'admin');
  return gid;
end;
$$;

-- ttl_hours is kept for signature compatibility and ignored: invites last 7 days.
create or replace function public.create_crew_invite(gid uuid, ttl_hours integer default 168)
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  exp timestamptz := now() + interval '7 days';
  n integer;
begin
  if not public.is_crew(gid) or not public.is_group_admin(gid) then
    raise exception 'only crew admins can invite' using errcode = '42501';
  end if;
  if public.is_guest() then
    raise exception 'create an account to invite people' using errcode = '42501', hint = 'guest';
  end if;
  perform 1 from public.groups g where g.id = gid for update;
  select count(*) into n from public.crew_invites i
   where i.group_id = gid and i.revoked_at is null and i.expires_at > now();
  if n >= 10 then
    raise exception 'too many active invites' using errcode = 'P0001', hint = 'invite_limit';
  end if;
  insert into public.crew_invites (group_id, token_hash, created_by, expires_at)
  values (gid, sha256(convert_to(t, 'UTF8')), auth.uid(), exp);
  return query select t, exp;
end;
$$;

-- Belt and braces: no invite row may outlive 7 days, however it was written.
alter table public.crew_invites
  add constraint crew_invites_max_7_days check (expires_at <= created_at + interval '7 days');

create or replace function public.join_crew(invite_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if public.is_guest() then
    raise exception 'create an account to join a crew' using errcode = '42501', hint = 'guest';
  end if;
  select i.group_id into gid
    from public.crew_invites i
   where i.token_hash = sha256(convert_to(coalesce(invite_token, ''), 'UTF8'))
     and i.revoked_at is null
     and i.expires_at > now();
  if gid is null then
    raise exception 'invite is invalid or expired' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = uid) then
    return gid;
  end if;
  -- Lock the crew row so concurrent joins serialize, then check the cap.
  -- (guard_crew_capacity re-checks on every insert path.)
  perform 1 from public.groups g where g.id = gid for update;
  if (select count(*) from public.group_members m where m.group_id = gid) >= public.crew_member_cap() then
    raise exception 'crew is full' using errcode = 'P0001', hint = 'crew_full';
  end if;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'member')
  on conflict (group_id, user_id) do nothing;
  return gid;
end;
$$;

revoke execute on function public.leave_crew(uuid) from public, anon;
grant execute on function public.leave_crew(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Crew posts are never public. posts.crew_only is derived by trigger (clients
-- can't write it) so community lists and any public count can filter on it.
-- ---------------------------------------------------------------------------
alter table public.posts add column crew_only boolean not null default false;
comment on column public.posts.crew_only is
  'True when the post belongs to a crew. Derived by trigger. Every public list or aggregate over posts must filter crew_only = false.';

create function public.set_post_crew_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.crew_only := new.group_id is not null and public.is_crew(new.group_id);
  return new;
end;
$$;
create trigger posts_crew_only before insert or update of group_id, crew_only on public.posts
  for each row execute function public.set_post_crew_only();

update public.posts p set crew_only = true
 where p.group_id is not null and public.is_crew(p.group_id);

create index posts_public_created_idx on public.posts (created_at desc) where not crew_only;
