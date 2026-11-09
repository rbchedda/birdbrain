-- Restores public.blur_point_keyed, guard/sync already call it, and re-blurs
-- posts to the 20261027000200 definition. Does not drop private.blur_salt
-- (that table was introduced by 20261027000200, not this migration).

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

update public.posts p set blurred_geom = public.blur_point_keyed(l.geom, p.author_id)
  from public.post_locations l where l.post_id = p.id and p.location_visibility <> 'hidden';
