// Pull PGC ArcGIS FeatureServer layers into public.places.
//
//   DATABASE_URL=postgres://... node ingest/arcgis.mjs               # all sources
//   DATABASE_URL=postgres://... node ingest/arcgis.mjs pheasant_stocking
//   node ingest/arcgis.mjs --describe                                # print live fields, no DB
//   node ingest/arcgis.mjs --out data/raw                            # fetch to GeoJSON, no DB
//   ... --force                                                      # ignore lastEditDate
//
// Each source is skipped when the layer's editingInfo.lastEditDate hasn't moved
// since the last successful run (tracked in public.ingest_state). Safe to re-run:
// rows are keyed on (source, source_id), and features removed upstream are deleted.
//
// Data: Pennsylvania Game Commission. Attribution and an "as is" disclaimer are
// required by the PGC Mapping Center license; show them in the app's data page.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PGC = 'https://services1.arcgis.com/k8yxvICm95iIFicb/arcgis/rest/services';
const PAGE_SIZE = 1000;

/** Case-insensitive property lookup across candidate field names. */
export function pick(props, ...names) {
  const lower = Object.fromEntries(Object.entries(props ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  for (const n of names) {
    const v = lower[n.toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

const num = (v) => (v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const epochToIso = (v) => (typeof v === 'number' ? new Date(v).toISOString() : null);

// Field names below are best guesses from the layer descriptions. Run
// `--describe` against the live service and adjust before trusting a mapping;
// unmapped attributes are kept in properties.raw either way.
export const SOURCES = {
  game_lands: {
    source: 'pgc:state_game_lands',
    layerUrl: `${PGC}/State_Game_Lands_Boundaries/FeatureServer/300`,
    type: 'game_land',
    species: [],
    toRow(p) {
      const sgl = num(pick(p, 'SGL', 'SGL_NUM', 'SGL_NUMBER', 'GAMELANDNUM', 'NUMBER'));
      if (!Number.isInteger(sgl)) return null;
      const acres = num(pick(p, 'ACRES', 'GIS_ACRES', 'SHAPE_AREA_ACRES'));
      return {
        source_id: String(sgl),
        name: `State Game Lands ${sgl}`,
        county: pick(p, 'COUNTY', 'COUNTY_NAME'),
        acres: acres === null ? null : Math.round(acres * 10) / 10,
        source_updated_at: epochToIso(pick(p, 'MOD_DATE', 'EDITDATE', 'LAST_EDITED_DATE')),
        properties: { sgl, pgc_region: pick(p, 'PGC_REGION', 'REGION') },
      };
    },
    // Several polygons can share one SGL number; merge them into one row.
    mergeBySourceId: true,
  },

  pheasant_stocking: {
    source: 'pgc:pheasant_stocking',
    layerUrl: `${PGC}/Pheasant_Hunting_Pennsylvania/FeatureServer/100`,
    type: 'stocking',
    species: ['pheasant'],
    toRow(p) {
      const property = pick(p, 'PROPERTY', 'PROPERTY_NAME', 'NAME', 'LOCATION');
      const id = pick(p, 'GLOBALID', 'SITE_ID', 'ID') ?? property;
      if (!id) return null;
      return {
        source_id: String(id),
        name: String(property ?? id),
        county: pick(p, 'COUNTY', 'COUNTY_NAME'),
        acres: null,
        source_updated_at: epochToIso(pick(p, 'EDITDATE', 'LAST_EDITED_DATE')),
        properties: {
          region: pick(p, 'REGION', 'PGC_REGION'),
          property_type: pick(p, 'PROPERTY_TYPE', 'PROP_TYPE', 'TYPE'),
          number_releases: num(pick(p, 'NUMBER_RELEASES', 'NUM_RELEASES')),
          total_released: num(pick(p, 'TOTAL_RELEASED', 'TOTAL_BIRDS')),
          late_season_status: pick(p, 'LATE_SEASON_STATUS', 'LATE_SEASON'),
        },
      };
    },
  },

  dove_fields: {
    source: 'pgc:managed_dove_fields',
    layerUrl: `${PGC}/Managed_Dove_Fields_(Public_View)/FeatureServer/0`,
    type: 'dove_field',
    species: ['dove'],
    toRow(p) {
      const id = pick(p, 'GLOBALID', 'FIELD_ID', 'ID', 'OBJECTID');
      if (id === null) return null;
      const sgl = num(pick(p, 'SGL', 'SGL_NUM', 'GAMELANDS'));
      const fieldName = pick(p, 'FIELD_NAME', 'NAME');
      return {
        source_id: String(id),
        name: String(fieldName ?? (sgl ? `SGL ${sgl} dove field` : `Dove field ${id}`)),
        county: pick(p, 'COUNTY', 'COUNTY_NAME'),
        acres: num(pick(p, 'ACRES', 'FIELD_ACRES')),
        source_updated_at: epochToIso(pick(p, 'EDITDATE', 'LAST_EDITED_DATE')),
        properties: { sgl, planted: pick(p, 'CROP', 'PLANTED', 'PLANTING', 'CROP_TYPE') },
      };
    },
  },
};

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`ArcGIS request failed: ${res.status} ${res.statusText} (${url})`);
  const body = await res.json();
  if (body.error) throw new Error(`ArcGIS error: ${JSON.stringify(body.error)} (${url})`);
  return body;
}

/** Layer metadata: fields, max record count, and editingInfo.lastEditDate. */
export async function fetchLayerInfo(layerUrl, { fetchImpl = fetch } = {}) {
  const info = await getJson(`${layerUrl}?f=json`, fetchImpl);
  return {
    name: info.name,
    geometryType: info.geometryType,
    maxRecordCount: info.maxRecordCount,
    lastEditDate: epochToIso(info.editingInfo?.lastEditDate ?? info.editingInfo?.dataLastEditDate),
    fields: (info.fields ?? []).map((f) => ({ name: f.name, type: f.type, alias: f.alias })),
  };
}

/** Every feature as WGS84 GeoJSON, following ArcGIS pagination. */
export async function fetchFeatures(layerUrl, { fetchImpl = fetch, pageSize = PAGE_SIZE } = {}) {
  const features = [];
  // Advance by what the server returned; it may cap pages below pageSize.
  for (let offset = 0; ; offset = features.length) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      outSR: '4326',
      geometryPrecision: '6',
      orderByFields: 'OBJECTID',
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: 'geojson',
    });
    const page = await getJson(`${layerUrl}/query?${params}`, fetchImpl);
    features.push(...(page.features ?? []));
    const more = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit;
    if (!page.features?.length || (!more && page.features.length < pageSize)) break;
  }
  return features;
}

/** Map features to place rows using a source config. */
export function toRows(config, features) {
  const rows = new Map();
  for (const f of features) {
    if (!f.geometry) continue;
    const props = f.properties ?? {};
    const row = config.toRow(props);
    if (!row) continue;
    const existing = rows.get(row.source_id);
    if (existing && config.mergeBySourceId) {
      existing.geometries.push(f.geometry);
      if (row.acres !== null) existing.acres = Math.round(((existing.acres ?? 0) + row.acres) * 10) / 10;
      continue;
    }
    if (existing) continue; // duplicate id without merging: keep the first
    rows.set(row.source_id, {
      ...row,
      geometries: [f.geometry],
      properties: { ...row.properties, raw: props },
    });
  }
  return [...rows.values()].map(({ geometries, ...r }) => ({
    ...r,
    geojson: JSON.stringify(
      geometries.length === 1 ? geometries[0] : { type: 'GeometryCollection', geometries },
    ),
    properties: JSON.stringify(r.properties),
  }));
}

/**
 * Upsert rows for one source and delete rows no longer upstream, in one
 * transaction. `db` is anything with query(text, params): pg.Client or PGlite.
 */
export async function upsertRows(db, config, rows, { layerUrl, lastEditDate } = {}) {
  // Points stay points; polygons (or merged collections) become one valid multipolygon.
  const geomSql = `case
      when extensions.geometrytype(g) in ('POINT', 'MULTIPOINT') then g
      else extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(g), 3))
    end`;
  await db.query('begin');
  try {
    for (const r of rows) {
      await db.query(
        `with src as (select extensions.st_setsrid(extensions.st_geomfromgeojson($2), 4326) g)
         insert into public.places (type, name, state, county, species, geom, acres, source, source_id, source_updated_at, properties)
         select $8::public.place_type, $1, 'PA', $9, $10::public.species[], ${geomSql}, $3, $4, $5, $6, $7::jsonb from src
         on conflict (source, source_id) do update set
           name = excluded.name,
           county = excluded.county,
           species = excluded.species,
           geom = excluded.geom,
           acres = excluded.acres,
           source_updated_at = excluded.source_updated_at,
           properties = excluded.properties`,
        [r.name, r.geojson, r.acres, config.source, r.source_id, r.source_updated_at, r.properties,
          config.type, r.county, `{${config.species.join(',')}}`],
      );
    }
    const removed = await db.query(
      `delete from public.places where source = $1 and not (source_id = any($2::text[]))`,
      [config.source, rows.map((r) => r.source_id)],
    );
    await db.query(
      `insert into public.ingest_state (source, layer_url, last_edit_date, feature_count, last_run_at)
       values ($1, $2, $3, $4, now())
       on conflict (source) do update set layer_url = excluded.layer_url,
         last_edit_date = excluded.last_edit_date, feature_count = excluded.feature_count, last_run_at = now()`,
      [config.source, layerUrl ?? config.layerUrl, lastEditDate ?? null, rows.length],
    );
    await db.query('commit');
    return { upserted: rows.length, deleted: removed.rowCount ?? removed.affectedRows ?? 0 };
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}

/** Whether the layer changed since the last recorded run. */
export async function needsRun(db, config, lastEditDate) {
  if (!lastEditDate) return true; // layer doesn't report edits; always refresh
  const { rows } = await db.query('select last_edit_date from public.ingest_state where source = $1', [config.source]);
  const prev = rows[0]?.last_edit_date;
  return !prev || new Date(prev).getTime() < new Date(lastEditDate).getTime();
}

/** Ingest one source end to end. Returns a summary for logging. */
export async function ingestSource(db, config, { fetchImpl = fetch, force = false } = {}) {
  const info = await fetchLayerInfo(config.layerUrl, { fetchImpl });
  if (!force && !(await needsRun(db, config, info.lastEditDate))) {
    return { source: config.source, skipped: true, lastEditDate: info.lastEditDate };
  }
  const features = await fetchFeatures(config.layerUrl, { fetchImpl, pageSize: Math.min(PAGE_SIZE, info.maxRecordCount || PAGE_SIZE) });
  const rows = toRows(config, features);
  // An empty or wildly short result usually means a schema change upstream; don't wipe the table.
  if (features.length > 0 && rows.length === 0) {
    throw new Error(`${config.source}: ${features.length} features but 0 usable rows. Check field mapping with --describe.`);
  }
  if (features.length === 0) throw new Error(`${config.source}: layer returned no features; refusing to delete existing rows.`);
  const result = await upsertRows(db, config, rows, { layerUrl: config.layerUrl, lastEditDate: info.lastEditDate });
  return { source: config.source, features: features.length, ...result, lastEditDate: info.lastEditDate };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const outIndex = args.indexOf('--out');
  const names = args.filter((a, i) => !a.startsWith('--') && i !== outIndex + 1);
  const selected = names.length ? names : Object.keys(SOURCES);
  for (const n of selected) if (!SOURCES[n]) throw new Error(`Unknown source "${n}". Known: ${Object.keys(SOURCES).join(', ')}`);

  if (flag('--describe')) {
    for (const n of selected) {
      const info = await fetchLayerInfo(SOURCES[n].layerUrl);
      const features = await fetchFeatures(SOURCES[n].layerUrl, { pageSize: 5 }).catch(() => []);
      const rows = toRows(SOURCES[n], features.slice(0, 5));
      console.log(`\n== ${n} (${info.name}, ${info.geometryType}), last edit ${info.lastEditDate}`);
      console.log(info.fields.map((f) => `  ${f.name} [${f.type}] ${f.alias ?? ''}`).join('\n'));
      console.log(`  sample mapped rows: ${rows.length} of ${Math.min(features.length, 5)}`);
      for (const r of rows.slice(0, 2)) console.log('  ', r.source_id, '|', r.name, '|', r.county, '|', r.properties.slice(0, 200));
    }
    return;
  }

  if (outIndex !== -1) {
    const dir = args[outIndex + 1];
    mkdirSync(dir, { recursive: true });
    for (const n of selected) {
      const features = await fetchFeatures(SOURCES[n].layerUrl);
      writeFileSync(join(dir, `${n}.geojson`), JSON.stringify({ type: 'FeatureCollection', features }));
      console.log(`Wrote ${features.length} features to ${join(dir, `${n}.geojson`)}`);
    }
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL, or use --describe / --out <dir>.');
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let failed = false;
  try {
    for (const n of selected) {
      try {
        console.log(JSON.stringify(await ingestSource(client, SOURCES[n], { force: flag('--force') })));
      } catch (err) {
        failed = true;
        console.error(`${n} failed: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
