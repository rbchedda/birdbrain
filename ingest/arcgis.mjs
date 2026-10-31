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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { classifyAccess } from '../app/src/data/access.ts';

const PGC = 'https://services1.arcgis.com/k8yxvICm95iIFicb/arcgis/rest/services';
const PAGE_SIZE = 1000;
// PGC's ArcGIS host is sometimes slow; cap each request so one hung layer can't wedge a run.
/**
 * Relative-shrink guard: a source whose fresh row count is below this fraction
 * of the rows it already has in places is aborted without deleting anything.
 * Override with INGEST_MIN_RATIO (0..1) or ingestSource's { minRatio }.
 */
export const DEFAULT_MIN_RATIO = 0.8;

/** Parse a ratio in [0, 1]; throws on anything else so a typo can't disable the guard. */
export function parseMinRatio(value, fallback = DEFAULT_MIN_RATIO) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`INGEST_MIN_RATIO must be a number from 0 to 1, got "${value}".`);
  return n;
}

export const FETCH_TIMEOUT_MS = Number(process.env.INGEST_FETCH_TIMEOUT_MS) || 60_000;

// Supabase Root 2021 CA (public). The pooler's chain ends here, not in Node's trust store.
// Provenance in the PR that added it; source: Supabase dashboard's certificate download URL.
export const SUPABASE_CA_PATH = new URL('./supabase-ca.crt', import.meta.url);

/**
 * pg.Client config that always verifies the server against the Supabase CA.
 * sslmode and every other ssl* query param are removed, because pg lets the URL's
 * TLS settings override the ssl object. The rest of the URL is left byte-for-byte as is.
 */
export function pgClientConfig(connectionString, ca = readFileSync(SUPABASE_CA_PATH, 'utf8')) {
  const q = connectionString.indexOf('?');
  let url = connectionString;
  if (q !== -1) {
    const hash = connectionString.indexOf('#', q);
    const query = connectionString.slice(q + 1, hash === -1 ? undefined : hash);
    const kept = query.split('&').filter((kv) => kv && !/^ssl/i.test(decodeURIComponent(kv.split('=')[0])));
    url = connectionString.slice(0, q) + (kept.length ? '?' + kept.join('&') : '') + (hash === -1 ? '' : connectionString.slice(hash));
  }
  return { connectionString: url, ssl: { ca, rejectUnauthorized: true } };
}

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
        properties: { sgl, pgc_region: pick(p, 'pgc_region'), status: pick(p, 'sgl_status'), access_type: 'state_game_land' },
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
      const name = sgl !== null ? `State Game Lands ${sgl}` : String(property).trim();
      const propertyType = pick(p, 'property_type');
      return {
        // Keyed by property, not GlobalID: PGC rebuilds this layer each season
        // (every feature was re-created in Sept-Oct 2026), which would churn
        // GlobalIDs and cascade-delete users' saved places.
        source_id: sgl !== null ? `sgl:${sgl}` : `name:${slug(property)}`,
        name,
        county: null,
        acres: null,
        source_updated_at: epochToIso(pick(p, 'last_edited_date')),
        properties: {
          sgl,
          pgc_region: pick(p, 'pgc_region'),
          property_type: propertyType,
          // null = unknown land status; the app hides these (app/src/data/access.ts).
          access_type: classifyAccess({ type: 'stocking', name, propertyType, sgl }),
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
        properties: {
          sgl: null,
          project_name: label,
          description,
          crops: cropsIn(description),
          // Off-SGL fields stay enrolled_private or null; assignSglByOverlap upgrades SGL overlaps.
          access_type: classifyAccess({ type: 'dove_field', name: label ?? '', sgl: null, description }),
        },
      };
    },
    sglByOverlap: { nameSuffix: 'dove field' },
  },
};

async function getJson(url, fetchImpl, timeoutMs = FETCH_TIMEOUT_MS) {
  // A referenced timer, not AbortSignal.timeout: its unref'd timer lets the event
  // loop drain while the fetch promise is pending on node 22, so the abort never
  // fires before the process exits.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`AbortError`)), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (controller.signal.aborted) throw new Error(`ArcGIS request timed out after ${timeoutMs} ms (${url})`);
    if (!res.ok) throw new Error(`ArcGIS request failed: ${res.status} ${res.statusText} (${url})`);
    const body = await res.json();
    if (body.error) throw new Error(`ArcGIS error: ${JSON.stringify(body.error)} (${url})`);
    return body;
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`ArcGIS request timed out after ${timeoutMs} ms (${url})`);
    throw err;
  } finally {
    clearTimeout(timer);
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
export async function fetchFeatures(layerUrl, { fetchImpl = fetch, pageSize = PAGE_SIZE, timeoutMs, strict = false } = {}) {
  const features = [];
  let prevMore = false;
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
    const n = page.features?.length ?? 0;
    // strict: pageSize is already capped at the layer's maxRecordCount, so a
    // short page that still says "more", or an empty page after "more", means
    // the server truncated the result.
    if (strict && more && n === 0) throw new Error(`partial result at offset ${offset}: exceededTransferLimit but no features`);
    if (strict && more && n < pageSize) throw new Error(`partial result at offset ${offset}: short page (${n} < ${pageSize}) with exceededTransferLimit`);
    if (strict && !n && prevMore) throw new Error(`partial result at offset ${offset}: empty page after exceededTransferLimit`);
    prevMore = Boolean(more);
    if (!n || (!more && n < pageSize)) break;
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
       properties = d.properties || jsonb_build_object('sgl', gl.sgl)
         || case when gl.sgl is null then '{}'::jsonb else jsonb_build_object('access_type', 'state_game_land') end,
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

/**
 * PA county boundaries from PGC's own "PA County" layer (PennDOT, US Census,
 * PGC). Loaded into public.counties so places get a county by spatial join
 * (see migration 20261024000000_place_counties). Ingest it before the place
 * sources; the DB trigger fills county on every place insert/update, and
 * assign_place_counties() backfills rows loaded earlier.
 */
export const COUNTIES = {
  source: 'pgc:pa_counties',
  layerUrl: `${PGC}/PA_Civic_Boundaries/FeatureServer/301`,
  fields: ['cnty_name_title', 'fips_cnty', 'pgc_region', 'last_edited_date'],
  /** PA has 67 counties; a short result means something upstream broke. */
  expected: 67,
};

export function toCountyRows(features) {
  const rows = new Map();
  for (const f of features) {
    const p = f.properties ?? {};
    const name = pick(p, 'cnty_name_title');
    const fips = pick(p, 'fips_cnty');
    if (!f.geometry || name === null || fips === null) continue;
    rows.set(String(name).trim(), {
      name: String(name).trim(),
      fips: String(fips).padStart(3, '0'),
      pgc_region: pick(p, 'pgc_region'),
      source_updated_at: epochToIso(pick(p, 'last_edited_date')),
      geojson: JSON.stringify(f.geometry),
    });
  }
  return [...rows.values()];
}

/** Replace public.counties and backfill place counties, in one transaction. */
export async function upsertCounties(db, rows, { lastEditDate, minRows = COUNTIES.expected } = {}) {
  if (rows.length < minRows) throw new Error(`${COUNTIES.source}: ${rows.length} counties, expected ${minRows}; refusing to load.`);
  await db.query('begin');
  try {
    for (const r of rows) {
      await db.query(
        `insert into public.counties (name, fips, pgc_region, geom, source, source_updated_at, updated_at)
         values ($1, $2, $3,
           extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
             extensions.st_setsrid(extensions.st_geomfromgeojson($4), 4326)), 3)),
           $5, $6, now())
         on conflict (name) do update set fips = excluded.fips, pgc_region = excluded.pgc_region, geom = excluded.geom,
           source = excluded.source, source_updated_at = excluded.source_updated_at, updated_at = now()`,
        [r.name, r.fips, r.pgc_region, r.geojson, COUNTIES.source, r.source_updated_at],
      );
    }
    await db.query(`delete from public.counties where not (name = any($1::text[]))`, [rows.map((r) => r.name)]);
    // Re-derive counties for places that got theirs from the join, then fill the rest.
    await db.query(`update public.places set county = null where county is not null and county <> coalesce(public.county_at(geom), county)`);
    const { rows: filled } = await db.query('select public.assign_place_counties() n');
    await db.query(
      `insert into public.ingest_state (source, layer_url, last_edit_date, feature_count, last_run_at)
       values ($1, $2, $3, $4, now())
       on conflict (source) do update set layer_url = excluded.layer_url,
         last_edit_date = excluded.last_edit_date, feature_count = excluded.feature_count, last_run_at = now()`,
      [COUNTIES.source, COUNTIES.layerUrl, lastEditDate ?? null, rows.length],
    );
    await db.query('commit');
    return { upserted: rows.length, placesFilled: filled[0].n };
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}

export async function ingestCounties(db, { fetchImpl = fetch, force = false, minRows } = {}) {
  const info = await fetchLayerInfo(COUNTIES.layerUrl, { fetchImpl });
  if (!force && !(await needsRun(db, COUNTIES, info.lastEditDate))) {
    return { source: COUNTIES.source, skipped: true, lastEditDate: info.lastEditDate };
  }
  const features = await fetchFeatures(COUNTIES.layerUrl, { fetchImpl, pageSize: Math.min(PAGE_SIZE, info.maxRecordCount || PAGE_SIZE) });
  const result = await upsertCounties(db, toCountyRows(features), { lastEditDate: info.lastEditDate, minRows });
  return { source: COUNTIES.source, features: features.length, ...result, lastEditDate: info.lastEditDate };
}

/** Whether the layer changed since the last recorded run. */
export async function needsRun(db, config, lastEditDate) {
  if (!lastEditDate) return true; // layer doesn't report edits; always refresh
  const { rows } = await db.query('select last_edit_date from public.ingest_state where source = $1', [config.source]);
  const prev = rows[0]?.last_edit_date;
  return !prev || new Date(prev).getTime() < new Date(lastEditDate).getTime();
}

/** Ingest one source end to end. Returns a summary for logging. */
export async function ingestSource(db, config, { fetchImpl = fetch, force = false, minRatio = parseMinRatio(process.env.INGEST_MIN_RATIO) } = {}) {
  minRatio = parseMinRatio(minRatio);
  const info = await fetchLayerInfo(config.layerUrl, { fetchImpl });
  if (!force && !(await needsRun(db, config, info.lastEditDate))) {
    return { source: config.source, skipped: true, lastEditDate: info.lastEditDate };
  }
  let features;
  try {
    features = await fetchFeatures(config.layerUrl, { fetchImpl, pageSize: Math.min(PAGE_SIZE, info.maxRecordCount || PAGE_SIZE), strict: true });
  } catch (err) {
    throw new Error(`${config.source}: ${err.message}; refusing to delete existing rows.`);
  }
  const rows = toRows(config, features);
  // An empty or wildly short result usually means a schema change upstream; don't wipe the table.
  if (features.length > 0 && rows.length === 0) {
    throw new Error(`${config.source}: ${features.length} features but 0 usable rows. Check field mapping with --describe.`);
  }
  if (features.length === 0) throw new Error(`${config.source}: layer returned no features; refusing to delete existing rows.`);
  const { rows: prevRows } = await db.query('select count(*)::int as n from public.places where source = $1', [config.source]);
  const previous = Number(prevRows[0]?.n ?? 0);
  if (previous > 0 && rows.length < previous * minRatio) {
    throw new Error(`${config.source}: shrink guard: ${rows.length} rows is under ${Math.round(minRatio * 100)}% of the previous ${previous}; refusing to delete existing rows. Set INGEST_MIN_RATIO lower if the drop is real.`);
  }
  const result = await upsertRows(db, config, rows, { layerUrl: config.layerUrl, lastEditDate: info.lastEditDate });
  return { source: config.source, features: features.length, ...result, lastEditDate: info.lastEditDate };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const outIndex = args.indexOf('--out');
  const names = args.filter((a, i) => !a.startsWith('--') && i !== outIndex + 1);
  // 'counties' is not a place source; it runs first so new places get a county.
  const withCounties = names.length === 0 || names.includes('counties');
  const selected = names.length ? names.filter((n) => n !== 'counties') : Object.keys(SOURCES);
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
  const client = new pg.Client(pgClientConfig(url));
  await client.connect();
  let failed = false;
  try {
    if (withCounties) {
      try {
        console.log(JSON.stringify(await ingestCounties(client, { force: flag('--force') })));
      } catch (err) {
        failed = true;
        console.error(`counties failed: ${err.message}`);
      }
    }
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
