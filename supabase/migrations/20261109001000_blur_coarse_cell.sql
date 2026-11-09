-- Security M1 (coarse-cell keyed blur).
--
-- The 20261027000200 comment said a keyed 1.5–3 km offset "can't be averaged
-- back to the spot." That only holds for byte-identical coordinates. The HMAC
-- was keyed on author + the point rounded to ~1 m (5 decimal degrees), so GPS
-- jitter gave each post an independent, zero-mean offset. Averaging those
-- public blurred_geom values converges on the true spot.
--
-- This migration keeps the private salt (private.blur_salt; not rotated) and
-- the 1.5–3 km annulus, but keys the HMAC on author + a coarse cell id and
-- places the blurred point at (cell center) + that offset — never at
-- (exact point) + offset. Every point in a cell therefore maps to the same
-- blurred_geom, so repeated posts from one spot cannot be averaged. Applying
-- the offset to the exact point would be trivially invertible: nearby posts
-- would share a translation and their relative layout would leak.
--
-- Cell: 1000 m squares in EPSG:5070 (NAD83 / Conus Albers, metres). 1000 m is
-- the small end of the requested 1–2 km range. A 2 km square has half-diagonal
-- ≈ 1414 m, which makes the feasible annulus [1500+h, 3000−h] empty, so the
-- 1.5–3 km true-point guarantee would be impossible. 5070 is a single metric
-- CRS covering all of Pennsylvania with low scale error; Web Mercator (3857)
-- stretches ~33% at 41°N and would make "1 km" cells much smaller on the
-- ground. PA State Plane (EPSG:3362 / 3364) is more accurate inside one zone
-- but would split the state. In PA the geodesic half-diagonal of a 1 km 5070
-- cell is about 709 m.
--
-- Offset radius is chosen per cell so the 1.5–3 km guarantee holds for every
-- point, including corners: r ∈ [1500+h, 3000−h] where h is the max geodesic
-- distance from the cell centre to the four projected corners (computed with
-- geography). That leaves ~80 m of radial range in Pennsylvania; the
-- direction is still uniform on the circle. The previous 0.01° output snap
-- (up to ~700 m of extra error) is dropped because it would break the
-- guarantee. The offset itself is applied with ST_Project from the cell
-- centre so the radius is a true geodesic length.
--
-- Points that straddle a cell boundary (GPS jitter across the edge) will
-- jump to a different shared blur; that is expected.
--
-- Re-blur: UPDATE posts.blurred_geom the same way 20261027000200 did. The
-- BEFORE trigger guard_post_blurred_geom owns the column and recomputes it
-- from post_locations via blur_point_keyed; this is the sanctioned path
-- (no trigger disable). read_shared_diary / read_crew_shared_diary call the
-- function at read time, so they pick up the new definition with no stored
-- column to backfill. Idempotent: same salt, same function, same outputs.
-- Public share flags are not touched.
--
-- Rollback: supabase/rollbacks/20261109001000_blur_coarse_cell.down.sql

create or replace function public.blur_point_keyed(p extensions.geometry, author uuid)
returns extensions.geometry
language plpgsql stable security definer set search_path = ''
as $$
declare
  cell_srid integer := 5070;
  cell_m double precision := 1000.0;
  annulus_lo double precision := 1500.0;
  annulus_hi double precision := 3000.0;
  src extensions.geometry;
  metric extensions.geometry;
  ix bigint;
  iy bigint;
  x0 double precision;
  y0 double precision;
  x1 double precision;
  y1 double precision;
  center_geog extensions.geography;
  h double precision;
  r_min double precision;
  r_max double precision;
  digest bytea;
  u1 double precision;
  u2 double precision;
  r double precision;
  az double precision;
begin
  if p is null then return null; end if;
  src := case
    when extensions.st_srid(p) = 0 then extensions.st_setsrid(p, 4326)
    else p
  end;
  metric := extensions.st_transform(src, cell_srid);
  ix := floor(extensions.st_x(metric) / cell_m)::bigint;
  iy := floor(extensions.st_y(metric) / cell_m)::bigint;
  x0 := ix * cell_m;
  y0 := iy * cell_m;
  x1 := x0 + cell_m;
  y1 := y0 + cell_m;
  center_geog := extensions.st_transform(
    extensions.st_setsrid(extensions.st_makepoint(x0 + cell_m / 2.0, y0 + cell_m / 2.0), cell_srid),
    4326)::extensions.geography;
  -- Corners of the closed projected square; the +x/+y edges belong to the next
  -- cell, so this slightly overestimates h and keeps the true-point bounds safe.
  h := greatest(
    extensions.st_distance(center_geog, extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(x0, y0), cell_srid), 4326)::extensions.geography),
    extensions.st_distance(center_geog, extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(x1, y0), cell_srid), 4326)::extensions.geography),
    extensions.st_distance(center_geog, extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(x0, y1), cell_srid), 4326)::extensions.geography),
    extensions.st_distance(center_geog, extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(x1, y1), cell_srid), 4326)::extensions.geography)
  );
  r_min := annulus_lo + h;
  r_max := annulus_hi - h;
  -- 1 km cells in the CONUS stay well below h = 750 m. If a point is transformed
  -- somewhere the square is larger, fall back to the midpoint rather than fail.
  if r_min >= r_max then
    r_min := (annulus_lo + annulus_hi) / 2.0;
    r_max := r_min;
  end if;
  digest := extensions.hmac(
    convert_to(
      coalesce(author::text, '') || ':5070:1000:' || ix::text || ':' || iy::text,
      'UTF8'),
    (select s.salt from private.blur_salt s),
    'sha256');
  u1 := ((get_byte(digest, 0)::bigint << 24) | (get_byte(digest, 1) << 16) | (get_byte(digest, 2) << 8) | get_byte(digest, 3)) / 4294967296.0;
  u2 := ((get_byte(digest, 4)::bigint << 24) | (get_byte(digest, 5) << 16) | (get_byte(digest, 6) << 8) | get_byte(digest, 7)) / 4294967296.0;
  r := sqrt(u2 * (r_max ^ 2 - r_min ^ 2) + r_min ^ 2);
  az := 2 * pi() * u1;
  return extensions.st_setsrid(extensions.st_project(center_geog, r, az)::extensions.geometry, 4326);
end;
$$;

revoke execute on function public.blur_point_keyed(extensions.geometry, uuid) from public, anon, authenticated;

-- Sanctioned path: the guard trigger overwrites blurred_geom from post_locations.
-- Hidden rows stay hidden (the trigger sets null).
update public.posts p
   set blurred_geom = public.blur_point_keyed(l.geom, p.author_id)
  from public.post_locations l
 where l.post_id = p.id
   and p.location_visibility <> 'hidden';
