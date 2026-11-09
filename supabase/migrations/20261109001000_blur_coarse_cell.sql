-- Security M1 (coarse-cell keyed blur, revised).
--
-- The 20261027000200 comment said a keyed 1.5–3 km offset "can't be averaged
-- back to the spot." That only holds for byte-identical coordinates. The HMAC
-- was keyed on author + the point rounded to ~1 m (5 decimal degrees), so GPS
-- jitter gave each post an independent, zero-mean offset. Averaging those
-- public blurred_geom values converges on the true spot.
--
-- This migration keeps the private salt (private.blur_salt; not rotated) and
-- the 1.5–3 km annulus, but keys the HMAC on author + a coarse cell id and
-- places the blurred point at (cell centre) + that offset — never at
-- (exact point) + offset. Every point in a cell therefore maps to the same
-- blurred_geom, so repeated posts from one spot cannot be averaged. Applying
-- the offset to the exact point would be trivially invertible: nearby posts
-- would share a translation and their relative layout would leak.
--
-- Cell: 250 m squares in EPSG:5070 (NAD83 / Conus Albers, metres). 5070 is a
-- single metric CRS covering all of Pennsylvania with low scale error; Web
-- Mercator (3857) stretches ~33% at 41°N and would make "250 m" cells much
-- smaller on the ground. PA State Plane (EPSG:3362 / 3364) is more accurate
-- inside one zone but would split the state. In PA the geodesic half-diagonal
-- of a 250 m 5070 cell is about 177 m, so the feasible annulus
-- r ∈ [1500+h, 3000−h] is about [1677, 2823] — more than 1 km of radial range.
--
-- Why 250 m, and why the band must stay wide: a first draft used a public
-- 1 km 5070 grid and a ~80 m radial band. The grid was a known function of
-- the coordinates alone, and the thin ring around a blurred point intersected
-- very few (often one) such cells, so a single public post recovered the
-- hunter's cell. Shrinking the cell lowers h and widens [1500+h, 3000−h]; we
-- require that width to be at least 1 km so the ring is not a unique-cell
-- fingerprint. The previous 0.01° output snap (up to ~700 m of extra error)
-- is dropped because it would break the 1.5–3 km true-point guarantee. The
-- offset is applied with ST_Project from the cell centre so the radius is a
-- true geodesic length, and the direction is uniform on the circle.
--
-- Secret per-author lattice: the grid origin is shifted by (dx, dy) in
-- [0, 250 m), derived from HMAC(salt, 'lattice:5070:250:' || author). The
-- offset HMAC uses a different message label ('offset:5070:250:…') so the two
-- digests are domain-separated. Cell indices are computed relative to that
-- shifted origin; the cell centre is origin + (ix+0.5, iy+0.5)*250 m. An
-- observer who sees one blurred point cannot enumerate a public grid to
-- recover the cell, because they do not know the author's origin (or the
-- salt).
--
-- Points that sit on a cell border can flip between two neighbouring shared
-- blurs if GPS jitter crosses the edge; that is accepted.
--
-- Residual (honest limitation): this stops averaging *within* a cell, which
-- is the "same favourite spot, GPS jitter" case. Posts from one hunter that
-- already span many cells still get independent offsets, so a large set of
-- public posts spread over a wide area can still leak the general-area
-- centroid of those cells. That is a different threat than recovering one
-- stand, and this migration does not close it.
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
  cell_m double precision := 250.0;
  annulus_lo double precision := 1500.0;
  annulus_hi double precision := 3000.0;
  src extensions.geometry;
  metric extensions.geometry;
  salt bytea;
  lattice bytea;
  ux double precision;
  uy double precision;
  dx double precision;
  dy double precision;
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
  salt := (select s.salt from private.blur_salt s);
  -- Domain-separated from the offset HMAC below (label 'lattice:' vs 'offset:').
  lattice := extensions.hmac(
    convert_to('lattice:5070:250:' || coalesce(author::text, ''), 'UTF8'),
    salt,
    'sha256');
  ux := ((get_byte(lattice, 0)::bigint << 24) | (get_byte(lattice, 1) << 16) | (get_byte(lattice, 2) << 8) | get_byte(lattice, 3)) / 4294967296.0;
  uy := ((get_byte(lattice, 4)::bigint << 24) | (get_byte(lattice, 5) << 16) | (get_byte(lattice, 6) << 8) | get_byte(lattice, 7)) / 4294967296.0;
  dx := ux * cell_m;
  dy := uy * cell_m;
  ix := floor((extensions.st_x(metric) - dx) / cell_m)::bigint;
  iy := floor((extensions.st_y(metric) - dy) / cell_m)::bigint;
  x0 := dx + ix * cell_m;
  y0 := dy + iy * cell_m;
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
  -- 250 m cells in the CONUS stay well below h = 250 m (band width 1500−2h >= 1 km).
  -- If a point is transformed somewhere the square is larger, fall back to the
  -- midpoint rather than fail a write.
  if r_min >= r_max then
    r_min := (annulus_lo + annulus_hi) / 2.0;
    r_max := r_min;
  end if;
  digest := extensions.hmac(
    convert_to(
      'offset:5070:250:' || coalesce(author::text, '') || ':' || ix::text || ':' || iy::text,
      'UTF8'),
    salt,
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
