import { covers, isValidPackId, type PackManifest } from './packs';
import { PACK_SOURCES } from './sources';
import { tilePath, type TileStore } from './store';

const RE = /^bboffline:\/\/([a-z]+)\/(\d+)\/(\d+)\/(\d+)$/;

function tileCenter(z: number, x: number, y: number) {
  const n = 2 ** z;
  const lng = ((x + 0.5) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI;
  return { lng, lat };
}

/**
 * Answers a bboffline://<source>/<z>/<x>/<y> request from the map page with the
 * stored tile as base64, or null (the page then falls back to the network).
 * Only complete or partially downloaded packs on this device are read.
 */
export async function serveTile(url: string, manifests: Record<string, PackManifest>, store: TileStore) {
  const m = RE.exec(url);
  if (!m) return null;
  const [, source, zs, xs, ys] = m;
  if (!Object.prototype.hasOwnProperty.call(PACK_SOURCES, source)) return null;
  const z = +zs, x = +xs, y = +ys;
  const c = tileCenter(z, x, y);
  // Packs whose box holds the tile center go first; low-zoom tiles are larger than
  // any pack, so the rest are still checked.
  const packs = Object.values(manifests)
    .filter((p) => isValidPackId(p.spec.id) && p.done > 0 && p.spec.basemaps.includes(source as never))
    .sort((a, b) => Number(covers(b.spec.bbox, c.lng, c.lat)) - Number(covers(a.spec.bbox, c.lng, c.lat)));
  for (const p of packs) {
    const data = await store.readBase64(tilePath(p.spec.id, source, z, x, y));
    if (data) return data;
  }
  return null;
}
