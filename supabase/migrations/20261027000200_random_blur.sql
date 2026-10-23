-- Security M1: replace the fixed 0.05° grid snap with a keyed random offset.
-- Offset: 1.5–3 km in a direction derived from HMAC(author_id + exact point, server salt),
-- then snapped to 0.01°. Deterministic per author+spot, so re-saving or many posts from
-- the same author at the same place can't be averaged back to the spot; the salt never
-- leaves the database (private schema, no API exposure, no grants).
-- Rollback: supabase/rollbacks/20261027000200_random_blur.down.sql
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.blur_salt (id boolean primary key default true check (id), salt bytea not null);
revoke all on private.blur_salt from public, anon, authenticated;
insert into private.blur_salt (salt) values (extensions.gen_random_bytes(32));

create or replace function public.blur_point_keyed(p extensions.geometry, author uuid)
returns extensions.geometry
language plpgsql stable security definer set search_path = ''
as $$
declare
  h bytea;
  u1 double precision;
  u2 double precision;
  r double precision;
  a double precision;
  lat double precision := extensions.st_y(p);
  lng double precision := extensions.st_x(p);
begin
  if p is null then return null; end if;
  h := extensions.hmac(
    convert_to(coalesce(author::text, '') || ':' || round(lng::numeric, 5)::text || ',' || round(lat::numeric, 5)::text, 'UTF8'),
    (select s.salt from private.blur_salt s), 'sha256');
  u1 := ((get_byte(h,0)::bigint << 24) | (get_byte(h,1) << 16) | (get_byte(h,2) << 8) | get_byte(h,3)) / 4294967296.0;
  u2 := ((get_byte(h,4)::bigint << 24) | (get_byte(h,5) << 16) | (get_byte(h,6) << 8) | get_byte(h,7)) / 4294967296.0;
  r := sqrt(u2 * (3000.0^2 - 1500.0^2) + 1500.0^2);   -- uniform over the 1.5–3 km annulus
  a := 2 * pi() * u1;
  lat := lat + (r * cos(a)) / 111320.0;
  lng := lng + (r * sin(a)) / (111320.0 * cos(radians(extensions.st_y(p))));
  return extensions.st_setsrid(extensions.st_makepoint(round(lng / 0.01) * 0.01, round(lat / 0.01) * 0.01), 4326);
end;
$$;
revoke execute on function public.blur_point_keyed(extensions.geometry, uuid) from public, anon, authenticated;

create or replace function public.guard_post_blurred_geom()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.blurred_geom := null;
  elsif new.location_visibility = 'hidden' then
    new.blurred_geom := null;
  else
    new.blurred_geom := (
      select public.blur_point_keyed(l.geom, new.author_id) from public.post_locations l where l.post_id = new.id
    );
  end if;
  return new;
end;
$function$;

create or replace function public.sync_post_blurred_geom()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  target uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts p
     set blurred_geom = case
       when tg_op = 'DELETE' or p.location_visibility = 'hidden' then null
       else public.blur_point_keyed(new.geom, p.author_id)
     end
   where p.id = target;
  return null;
end;
$function$;
-- Re-blur any existing posts (0 rows on 2026-10-23).
update public.posts p set blurred_geom = public.blur_point_keyed(l.geom, p.author_id)
  from public.post_locations l where l.post_id = p.id and p.location_visibility <> 'hidden';
