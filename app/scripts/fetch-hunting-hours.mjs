#!/usr/bin/env node
// Fetch the official PGC hunting-hours tables and write the bundled data file
// app/src/data/huntingHours.json. Reproducible: rerun with
//   node app/scripts/fetch-hunting-hours.mjs
// Source: PGC_Hunting_Hours FeatureServer (item 9d575904d81b49ec936a95f468afd430),
//   /400 PGC Hunting Hours Lookup: one row per day, base (easternmost) band, Eastern time.
//   /300 Hunting Hours zones: longitude bands with minutes_plus.
// The script fails rather than writing a partial file.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICE = 'https://services1.arcgis.com/k8yxvICm95iIFicb/arcgis/rest/services/PGC_Hunting_Hours/FeatureServer';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'huntingHours.json');

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${url}: ${JSON.stringify(json.error)}`);
  return json;
}

async function queryAll(layer, params) {
  const rows = [];
  for (let offset = 0; ; ) {
    const q = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'false', orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: '2000', f: 'json', ...params });
    const page = await get(`${SERVICE}/${layer}/query?${q}`);
    rows.push(...page.features.map((f) => f.attributes));
    offset += page.features.length;
    if (!page.exceededTransferLimit || page.features.length === 0) break;
  }
  return rows;
}

// Lookup dates are midnight Eastern instants; read them back as Eastern calendar dates.
const ymd = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
const hhmm = /^\d{2}:\d{2}$/;

const info = await get(`${SERVICE}/400?f=json`);
const lookup = await queryAll(400, { orderByFields: 'date' });
const zones = await queryAll(300, {});

const rows = {};
for (const r of lookup) {
  const d = ymd(r.date);
  for (const k of ['sunrise', 'sunset', 'hunt_start', 'hunt_end']) if (!hhmm.test(r[k] ?? '')) throw new Error(`${d}: bad ${k} ${r[k]}`);
  if (rows[d]) throw new Error(`duplicate date ${d}`);
  rows[d] = [r.sunrise, r.sunset, r.hunt_start, r.hunt_end];
}
const dates = Object.keys(rows).sort();
if (dates.length < 4000) throw new Error(`only ${dates.length} rows; refusing to write`);
if (zones.length !== 7) throw new Error(`expected 7 zones, got ${zones.length}`);

const data = {
  source: `${SERVICE}/400`,
  zonesSource: `${SERVICE}/300`,
  fetchedAt: new Date().toISOString(),
  lastEditDate: new Date(info.editingInfo.lastEditDate).toISOString(),
  first: dates[0],
  last: dates.at(-1),
  count: dates.length,
  columns: ['sunrise', 'sunset', 'hunt_start', 'hunt_end'],
  zones: zones
    .map((z) => ({ meridianEast: z.meridian_east, meridianWest: z.meridian_west, minutesPlus: z.minutes_plus }))
    .sort((a, b) => a.meridianEast - b.meridianEast),
  rows: Object.fromEntries(dates.map((d) => [d, rows[d]])),
};
writeFileSync(out, JSON.stringify(data) + '\n');
console.log(`wrote ${out}: ${data.count} rows ${data.first}..${data.last}, ${data.zones.length} zones, fetched ${data.fetchedAt}`);
