import type { GeoJSONGeometry, LngLat, Place } from '@/data/types';

/**
 * PostgREST returns PostGIS geometry as GeoJSON (PostGIS casts geometry to
 * json). Older setups return hex EWKB instead, so points accept both.
 */
export function parsePoint(value: unknown): LngLat | null {
  if (!value) return null;
  if (typeof value === 'string') {
    if (value.trim().startsWith('{')) return parsePoint(JSON.parse(value));
    return parseEwkbPoint(value);
  }
  const g = value as GeoJSONGeometry;
  if (g.type === 'Point' && Array.isArray(g.coordinates)) {
    const [lng, lat] = g.coordinates as number[];
    return { lng, lat };
  }
  return null;
}

export function parseGeometry(value: unknown): GeoJSONGeometry | null {
  if (!value) return null;
  if (typeof value === 'string') return value.trim().startsWith('{') ? JSON.parse(value) : null;
  return typeof value === 'object' && 'type' in (value as object) ? (value as GeoJSONGeometry) : null;
}

function parseEwkbPoint(hex: string): LngLat | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 42) return null;
  const bytes = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
  const view = new DataView(bytes.buffer);
  const le = bytes[0] === 1;
  const type = view.getUint32(1, le);
  if ((type & 0xff) !== 1) return null;
  const offset = type & 0x20000000 ? 9 : 5; // skip SRID when present
  return { lng: view.getFloat64(offset, le), lat: view.getFloat64(offset + 8, le) };
}

/** EWKT for inserting a point through PostgREST. */
export const toEwkt = (p: LngLat) => `SRID=4326;POINT(${p.lng} ${p.lat})`;

export function distanceKm(a: LngLat, b: LngLat) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * Human label for a blurred ~5 km cell: the county of the nearest known place.
 * Deliberately coarse, never names the place itself.
 */
export function areaLabel(area: LngLat | null, places: Place[]) {
  if (!area) return 'Location hidden';
  let best: Place | undefined;
  let bestKm = Infinity;
  for (const p of places) {
    if (!p.county) continue;
    const km = distanceKm(area, p.center);
    if (km < bestKm) [best, bestKm] = [p, km];
  }
  return best && bestKm < 40 ? `Near ${best.county} County` : 'Pennsylvania';
}
