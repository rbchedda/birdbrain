import type { LngLat } from '@/data/types';

/** [west, south, east, north] in degrees. */
export type Bbox = [number, number, number, number];
export interface TileXYZ { z: number; x: number; y: number }

const MAX_LAT = 85.05112878;

export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * (Math.PI / 180);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

export function tileRange(bbox: Bbox, z: number) {
  const a = lngLatToTile(bbox[0], bbox[3], z);
  const b = lngLatToTile(bbox[2], bbox[1], z);
  return { minX: a.x, maxX: b.x, minY: a.y, maxY: b.y };
}

export function countTiles(bbox: Bbox, minz: number, maxz: number) {
  let n = 0;
  for (let z = minz; z <= maxz; z++) {
    const r = tileRange(bbox, z);
    n += (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1);
  }
  return n;
}

export function* tilesFor(bbox: Bbox, minz: number, maxz: number): Generator<TileXYZ> {
  for (let z = minz; z <= maxz; z++) {
    const r = tileRange(bbox, z);
    for (let x = r.minX; x <= r.maxX; x++) for (let y = r.minY; y <= r.maxY; y++) yield { z, x, y };
  }
}

/** Square box of `km` half-width around a point. */
export function bboxAround(center: LngLat, km: number): Bbox {
  const { lng, lat } = center;
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/** Bounding box of any GeoJSON geometry (or null). */
export function bboxOfGeometry(geom: unknown): Bbox | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]);
    } else c.forEach(walk);
  };
  const g = geom as { coordinates?: unknown; geometries?: unknown[] } | null;
  if (!g) return null;
  if (g.geometries) g.geometries.forEach((x) => walk((x as { coordinates?: unknown }).coordinates));
  else walk(g.coordinates);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}
