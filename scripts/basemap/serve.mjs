#!/usr/bin/env node
// Dev host for basemap-out/: CORS + HTTP Range (PMTiles needs both). Production (R2) is blocked.
// Usage: node scripts/basemap/serve.mjs [--port 8787]  then EXPO_PUBLIC_MAP_ASSETS_URL=http://<lan-ip>:8787
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { OUT } from './common.mjs';

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8787;
const types = { '.png': 'image/png', '.pbf': 'application/x-protobuf', '.pmtiles': 'application/octet-stream' };

export const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, ETag');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(OUT, rel);
  const st = await stat(file).catch(() => null);
  if (!file.startsWith(OUT) || !st?.isFile()) return res.writeHead(404).end();
  const type = types[extname(file)] ?? 'application/octet-stream';
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  if (m) {
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes' });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' });
  createReadStream(file).pipe(res);
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  server.listen(port, '0.0.0.0', () => console.log(`basemap assets: http://0.0.0.0:${port}/ (from ${OUT})`));
}
