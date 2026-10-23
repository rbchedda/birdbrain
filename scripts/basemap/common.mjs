import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Pennsylvania, with a small margin (W, S, E, N). */
export const PA_BBOX = [-80.6, 39.65, -74.6, 42.35];
export const DEM_MAXZOOM = 12;
export const OUT = process.env.BASEMAP_OUT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'basemap-out');

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Every {z,x,y} covering bbox from minzoom..maxzoom. */
export function tilesFor(bbox, minzoom, maxzoom) {
  const [w, s, e, n] = bbox;
  const out = [];
  for (let z = minzoom; z <= maxzoom; z++) {
    for (let x = lon2x(w, z); x <= lon2x(e, z); x++) for (let y = lat2y(n, z); y <= lat2y(s, z); y++) out.push({ z, x, y });
  }
  return out;
}
