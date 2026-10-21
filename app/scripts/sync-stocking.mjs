#!/usr/bin/env node
// Copy the committed PGC pheasant allocation seed (data/pgc/, written by
// ingest/stocking_windows.mjs) into the app bundle. Metro can't import files
// outside app/, so the app ships this copy; a jest test fails if they drift.
//   node app/scripts/sync-stocking.mjs
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', '..', 'data', 'pgc', 'pheasant-allocation-2026-27.json');
const to = join(here, '..', 'src', 'data', 'pgcStocking.json');
copyFileSync(from, to);
console.log(`copied ${from} -> ${to}`);
