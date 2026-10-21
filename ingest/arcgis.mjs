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
// PGC's ArcGIS host is sometimes slow; cap each request so one hung layer can't wedge a run.
export const FETCH_TIMEOUT_MS = Number(process.env.INGEST_FETCH_TIMEOUT_MS) || 60_000;

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
const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);

/** Lowercase slug for building stable ids from names. */
export const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Crops named in dove field descriptions ("planted in wheat, sunflower, and brown-top millet").
const CROPS = ['sunflower', 'wheat', 'millet', 'sorghum', 'buckwheat', 'small grains'];
export const cropsIn = (text) => CROPS.filter((c) => new RegExp(`\\b${c}`, 'i').test(text ?? ''));

// Mappings verified against the live layers with `--describe` on 2026-10-21;
// ingest/fixtures/pgc-live-sample.json holds the captured schemas and sample
// rows. `fields` lists every attribute a mapping reads, so --describe can flag
// drift. None of the three layers carries a county. Unmapped attributes are
// kept in properties.raw either way.
export const SOURCES = {
  game_lands: {
    source: 'pgc:state_game_lands',
    layerUrl: `${PGC}/State_Game_Lands_Boundaries/FeatureServer/300`,
    type: 'game_land',
    species: [],
    fields: ['sgl', 'gis_area_ac', 'pgc_region', 'sgl_status', 'last_edited_date'],
    toRow(p) {
      const sgl = num(pick(p, 'sgl'));
      if (!Number.isInteger(sgl)) return null;
      return {
        source_id: String(sgl),
        name: `State Game Lands ${sgl}`,
        county: null,
        acres: round1(num(pick(p, 'gis_area_ac'))),
        source_updated_at: epochToIso(pick(p, 'last_edited_date')),
        properties: { sgl, pgc_region: pick(p, 'pgc_region'), status: pick(p, 'sgl_status') },
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
    fields: ['property_name', 'property_type', 'pgc_region', 'late_season_status', 'number_releases',
      'total_released', 'globalid', 'last_edited_date'],
    toRow(p) {
      const property = pick(p, 'property_name');
      if (property === null) return null;
      // Game lands are listed by bare number ("65"), sometimes without a property_type.
      const sgl = /^\d{1,3}$/.test(String(property).trim()) ? Number(property) : null;
      const late = pick(p, 'late_season_status');
      return {
        // Keyed by property, not GlobalID: PGC rebuilds this layer each season
        // (every feature was re-created in Sept-Oct 2026), which would churn
        // GlobalIDs and cascade-delete users' saved places.
        source_id: sgl !== null ? `sgl:${sgl}` : `name:${slug(property)}`,
        name: sgl !== null ? `State Game Lands ${sgl}` : String(property).trim(),
        county: null,
        acres: null,
        source_updated_at: epochToIso(pick(p, 'last_edited_date')),
        properties: {
          sgl,
          pgc_region: pick(p, 'pgc_region'),
          property_type: pick(p, 'property_type'),
          late_season: late === null ? null : !/^no\b/i.test(late),
          number_releases: num(pick(p, 'number_releases')),
          total_released: num(pick(p, 'total_released')),
          globalid: pick(p, 'globalid'),
        },
      };
    },
  },

  dove_fields: {
    source: 'pgc:managed_dove_fields',
    layerUrl: `${PGC}/Managed_Dove_Fields_(Public_View)/FeatureServer/0`,
    type: 'dove_field',
    species: ['dove'],
    fields: ['GlobalID', 'Project_Name', 'Project_Area', 'Description', 'Active', 'last_edited_date'],
    toRow(p) {
      const id = pick(p, 'GlobalID');
      if (id === null || /^n/i.test(pick(p, 'Active') ?? '')) return null;
      // Project_Name is free text: "SGL 169", "252", "Windmill Hill", "2425", or blank.
      // Bare numbers aren't reliably SGLs (411, 414, 419 lie off game lands),
      // so the SGL comes from the polygon overlap in upsertRows (sglByOverlap).
      const label = pick(p, 'Project_Name')?.trim() ?? null;
      const description = pick(p, 'Description');
      return {
        source_id: String(id),
        name: !label ? 'Dove field' : /dove/i.test(label) ? label : /^\d+$/.test(label) ? `Dove field ${label}` : `${label} dove field`,
        county: null,
        // Blank for a few fields; upsertRows fills those from the geometry.
        acres: round1(num(pick(p, 'Project_Area'))),
        source_updated_at: epochToIso(pick(p, 'last_edited_date')),
        properties: { sgl: null, project_name: label, description, crops: cropsIn(description) },
      };
    },
    sglByOverlap: { nameSuffix: 'dove field' },
  },
};

async function getJson(url, fetchImpl, timeoutMs = FETCH_TIMEOUT_MS) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetchImpl(url, { signal });
    if (!res.ok) throw new Error(`ArcGIS request failed: ${res.status} ${res.statusText} (${url})`);
    const body = await res.json();
    if (body.error) throw new Error(`ArcGIS error: ${JSON.stringify(body.error)} (${url})`);
    return body;
  } catch (err) {
    if (signal.aborted) throw new Error(`ArcGIS request timed out after ${timeoutMs} ms (${url})`);
    throw err;
  }
}

/** Layer metadata: fields, max record count, and editingInfo.lastEditDate. */
export async function fetchLayerInfo(layerUrl, { fetchImpl = fetch, timeoutMs } = {}) {
  const info = await getJson(`${layerUrl}?f=json`, fetchImpl, timeoutMs);
  return {
    name: info.name,
    geometryType: info.geometryType,
    maxRecordCount: info.maxRecordCount,
    lastEditDate: epochToIso(info.editingInfo?.lastEditDate ?? info.editingInfo?.dataLastEditDate),
    fields: (info.fields ?? []).map((f) => ({ name: f.name, type: f.type, alias: f.alias })),
  };
}

/** Every feature as WGS84 GeoJSON, following ArcGIS pagination. */
export async function fetchFeatures(layerUrl, { fetchImpl = fetch, pageSize = PAGE_SIZE, timeoutMs } = {}) {
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
    const page = await getJson(`${layerUrl}/query?${params}`, fetchImpl, timeoutMs);
    features.push(...(page.features ?? []));
    const more = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit;
    if (!page.features?.length || (!more && page.features.length < pageSize)) break;
  }
  return features;
}

/** Mapped field names a layer no longer has (exact match; ArcGIS names are case-sensitive in queries). */
export function missingFields(config, liveFields) {
  const live = new Set(liveFields.map((f) => f.name));
  return config.fields.filter((name) => !live.has(name));
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
  // When PGC leaves a polygon's acreage blank, use its geodesic area.
  const acresSql = `coalesce($3::numeric, case when extensions.geometrytype(g) in ('POLYGON', 'MULTIPOLYGON')
      then round((extensions.st_area(g::extensions.geography) / 4046.8564224)::numeric, 1) end)`;
  await db.query('begin');
  try {
    for (const r of rows) {
      await db.query(
        `with src as (select extensions.st_setsrid(extensions.st_geomfromgeojson($2), 4326) g)
         insert into public.places (type, name, state, county, species, geom, acres, source, source_id, source_updated_at, properties)
         select $8::public.place_type, $1, 'PA', $9, $10::public.species[], ${geomSql}, ${acresSql}, $4, $5, $6, $7::jsonb from src
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
    if (config.sglByOverlap) await assignSglByOverlap(db, config);
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

/**
 * Tag each of a source's places with the State Game Land it overlaps most and
 * name it after that SGL ("SGL 252 dove field"). Uses the game lands already in places, so ingest
 * game_lands first (SOURCES order does).
 */
async function assignSglByOverlap(db, config) {
  await db.query(
    `update public.places d set
       properties = d.properties || jsonb_build_object('sgl', gl.sgl),
       name = case when gl.sgl is null then d.name else 'SGL ' || gl.sgl || ' ' || $3 end
     from public.places d2
     left join lateral (
       select (g.properties ->> 'sgl')::int sgl from public.places g
        where g.source = $2 and extensions.st_intersects(g.geom, d2.geom)
        order by extensions.st_area(extensions.st_intersection(g.geom, d2.geom)) desc
        limit 1
     ) gl on true
     where d.id = d2.id and d.source = $1`,
    [config.source, SOURCES.game_lands.source, config.sglByOverlap.nameSuffix],
  );
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
    let drift = false;
    for (const n of selected) {
      try {
        const info = await fetchLayerInfo(SOURCES[n].layerUrl);
        const features = await fetchFeatures(SOURCES[n].layerUrl, { pageSize: 5 }).catch(() => []);
        const rows = toRows(SOURCES[n], features.slice(0, 5));
        const missing = missingFields(SOURCES[n], info.fields);
        drift ||= missing.length > 0;
        console.log(`\n== ${n} (${info.name}, ${info.geometryType}), last edit ${info.lastEditDate}`);
        console.log(info.fields.map((f) => `  ${SOURCES[n].fields.includes(f.name) ? '*' : ' '} ${f.name} [${f.type}] ${f.alias ?? ''}`).join('\n'));
        console.log(`  (* = mapped) mapped fields missing from the live layer: ${missing.join(', ') || 'none'}`);
        console.log(`  sample mapped rows: ${rows.length} of ${Math.min(features.length, 5)}`);
        for (const r of rows.slice(0, 2)) console.log('  ', r.source_id, '|', r.name, '|', r.acres, '|', r.properties.slice(0, 200));
      } catch (err) {
        drift = true;
        console.error(`\n== ${n} failed: ${err.message}`);
      }
    }
    if (drift) process.exitCode = 1;
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
