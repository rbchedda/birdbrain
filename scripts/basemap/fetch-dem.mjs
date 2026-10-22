#!/usr/bin/env node
// PA Terrarium DEM from AWS Terrain Tiles (open data; attribution: USGS 3DEP/GMTED2010/SRTM, Mapzen).
// Usage: node scripts/basemap/fetch-dem.mjs [--maxzoom 12] [--concurrency 16]
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DEM_MAXZOOM, OUT, PA_BBOX, tilesFor } from './common.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const maxzoom = arg('--maxzoom', DEM_MAXZOOM);
const concurrency = arg('--concurrency', 16);
const SRC = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

const tiles = tilesFor(PA_BBOX, 0, maxzoom);
let done = 0, skipped = 0, bytes = 0;
async function one({ z, x, y }) {
  const file = join(OUT, 'dem', String(z), String(x), `${y}.png`);
  if (await stat(file).then((s) => s.size > 0, () => false)) return void skipped++;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${SRC}/${z}/${x}/${y}.png`).catch((e) => ({ ok: false, status: e.message }));
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(join(OUT, 'dem', String(z), String(x)), { recursive: true });
      await writeFile(file, buf);
      bytes += buf.length;
      return void done++;
    }
    if (attempt >= 4) throw new Error(`DEM ${z}/${x}/${y}: ${res.status}`);
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
}
const queue = [...tiles];
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (queue.length) await one(queue.shift());
}));
console.log(`DEM z0-${maxzoom}: ${tiles.length} tiles (${done} fetched, ${skipped} cached), +${(bytes / 1e6).toFixed(1)} MB -> ${join(OUT, 'dem')}`);
