#!/usr/bin/env node
// PBF glyphs for the map's three fontstacks (both families are SIL OFL 1.1).
// Usage: node scripts/basemap/build-glyphs.mjs   (needs `npm i --no-save fontnik` in the repo root)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { OUT } from './common.mjs';

const require = createRequire(import.meta.url);
const fontnik = require('fontnik');
const CACHE = join(OUT, '.font-src');
const INTER_ZIP = 'https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip';
const BARLOW = 'https://github.com/google/fonts/raw/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf';
const STACKS = {
  'Inter Medium': 'extras/ttf/Inter-Medium.ttf',
  'Inter Medium Italic': 'extras/ttf/Inter-MediumItalic.ttf',
  'Barlow Condensed Bold': 'BarlowCondensed-Bold.ttf',
};

async function download(url, file) {
  if (existsSync(file)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

await mkdir(CACHE, { recursive: true });
await download(INTER_ZIP, join(CACHE, 'inter.zip'));
if (!existsSync(join(CACHE, STACKS['Inter Medium']))) execFileSync('unzip', ['-o', '-q', join(CACHE, 'inter.zip'), 'extras/ttf/*', 'LICENSE.txt', '-d', CACHE]);
await download(BARLOW, join(CACHE, STACKS['Barlow Condensed Bold']));

const range = (font, start, end) =>
  new Promise((ok, fail) => fontnik.range({ font, start, end }, (err, pbf) => (err ? fail(err) : ok(pbf))));

for (const [stack, rel] of Object.entries(STACKS)) {
  const font = await readFile(join(CACHE, rel));
  const dir = join(OUT, 'fonts', stack);
  await mkdir(dir, { recursive: true });
  for (let start = 0; start < 65536; start += 256) {
    await writeFile(join(dir, `${start}-${start + 255}.pbf`), await range(font, start, start + 255));
  }
  console.log(`glyphs: ${stack} -> ${dir}`);
}
