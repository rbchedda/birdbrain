#!/usr/bin/env node
// Reproducible fetch of the French Creek State Park outline (read-only, bundled in the app; no DB write).
// Source: PASDA, DCNR Bureau of State Parks "DCNR State Parks 202503" layer (MapServer/8).
// The publisher describes it as an approximate boundary, not a survey.
// Usage: node scripts/fetch-french-creek.mjs   (needs network + npx for mapshaper)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LAYER = 'https://mapservices.pasda.psu.edu/server/rest/services/pasda/DCNR/MapServer/8';
const query = new URLSearchParams({ where: "PARK_NAME='French Creek'", outFields: 'PARK_NAME,TYPE,COUNTY,GIS_ACRE', f: 'geojson', outSR: '4326' });
const OUT = new URL('../app/src/data/frenchCreek.json', import.meta.url).pathname;
const SIMPLIFY = process.env.SIMPLIFY ?? '30%';

const res = await fetch(`${LAYER}/query?${query}`);
if (!res.ok) throw new Error(`PASDA ${res.status}`);
const raw = await res.json();
if (raw.features?.length !== 1) throw new Error(`expected 1 feature, got ${raw.features?.length}`);

const dir = mkdtempSync(join(tmpdir(), 'fc-'));
const inPath = join(dir, 'raw.geojson');
const outPath = join(dir, 'simple.geojson');
writeFileSync(inPath, JSON.stringify(raw));
execFileSync('npx', ['-y', 'mapshaper@0.6', inPath, '-simplify', SIMPLIFY, 'keep-shapes', '-o', outPath, 'precision=0.00001', 'format=geojson'], { stdio: 'inherit' });

const simple = JSON.parse(readFileSync(outPath, 'utf8'));
const f = simple.features[0];
const out = {
  type: 'FeatureCollection',
  source: `${LAYER} (PASDA; DCNR Bureau of State Parks)`,
  layer: 'DCNR State Parks 202503',
  fetched: new Date().toISOString().slice(0, 10),
  features: [{ type: 'Feature', properties: { name: 'French Creek State Park', county: f.properties.COUNTY, kind: 'state_park' }, geometry: f.geometry }],
};
writeFileSync(OUT, JSON.stringify(out) + '\n');
const count = (g) => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat()).reduce((n, r) => n + r.length, 0);
console.log(`vertices raw=${count(raw.features[0].geometry)} simplified=${count(f.geometry)} size=${statSync(OUT).size} bytes -> ${OUT}`);
