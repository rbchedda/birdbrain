// Pull Pennsylvania State Game Lands boundaries from PASDA and upsert them into
// public.places (type = 'game_land').
//
//   DATABASE_URL=postgres://... node ingest/game-lands.mjs
//   node ingest/game-lands.mjs --out data/raw/game-lands.geojson   # fetch only
//
// DATABASE_URL must be a role that bypasses RLS (the Supabase direct or pooler
// connection string as `postgres`). Safe to re-run: rows are keyed on
// (source, source_id) and removed SGLs are deleted.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LAYER_URL =
  'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennsylvaniaGameCommission/MapServer/4';
export const SOURCE = 'pasda:pgc_state_game_lands';
const PAGE_SIZE = 100;

/** Fetch every feature as GeoJSON in WGS84, following ArcGIS pagination. */
export async function fetchGameLands({ layerUrl = LAYER_URL, fetchImpl = fetch } = {}) {
  const features = [];
  // Advance by what the server actually returned; it may cap pages below PAGE_SIZE.
  for (let offset = 0; ; offset = features.length) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: 'SGL,NAME,ACRES,PGC_REGION,LANDMGT_GR,VALIDITY,MOD_DATE',
      outSR: '4326',
      geometryPrecision: '6',
      orderByFields: 'SGL',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: 'geojson',
    });
    const res = await fetchImpl(`${layerUrl}/query?${params}`);
    if (!res.ok) throw new Error(`PASDA query failed: ${res.status} ${res.statusText}`);
    const page = await res.json();
    if (page.error) throw new Error(`PASDA query error: ${JSON.stringify(page.error)}`);
    features.push(...page.features);
    const more = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit;
    if (page.features.length === 0 || (!more && page.features.length < PAGE_SIZE)) break;
  }
  return features;
}

/** Map PASDA features to rows for public.places. */
export function toPlaces(features) {
  const rows = [];
  for (const f of features) {
    const p = f.properties ?? {};
    if (!f.geometry || !Number.isInteger(p.SGL)) continue;
    rows.push({
      source_id: String(p.SGL),
      name: `State Game Lands ${p.SGL}`,
      acres: typeof p.ACRES === 'number' ? Math.round(p.ACRES * 10) / 10 : null,
      geojson: JSON.stringify(f.geometry),
      source_updated_at: p.MOD_DATE ? new Date(p.MOD_DATE).toISOString() : null,
      properties: JSON.stringify({
        sgl: p.SGL,
        pgc_region: p.PGC_REGION ?? null,
        land_mgmt_group: p.LANDMGT_GR ?? null,
        validity: p.VALIDITY ?? null,
      }),
    });
  }
  return rows;
}

/**
 * Upsert rows and delete game lands no longer in the source, in one
 * transaction. `db` is anything with query(text, params): pg.Client or PGlite.
 */
export async function upsertPlaces(db, rows) {
  await db.query('begin');
  try {
    for (const r of rows) {
      await db.query(
        `insert into public.places (type, name, state, geom, acres, source, source_id, source_updated_at, properties)
         values ('game_land', $1, 'PA',
                 extensions.st_multi(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson($2), 4326))),
                 $3, $4, $5, $6, $7::jsonb)
         on conflict (source, source_id) do update set
           name = excluded.name,
           geom = excluded.geom,
           acres = excluded.acres,
           source_updated_at = excluded.source_updated_at,
           properties = excluded.properties`,
        [r.name, r.geojson, r.acres, SOURCE, r.source_id, r.source_updated_at, r.properties],
      );
    }
    const removed = await db.query(
      `delete from public.places where source = $1 and not (source_id = any($2::text[]))`,
      [SOURCE, rows.map((r) => r.source_id)],
    );
    await db.query('commit');
    return { upserted: rows.length, deleted: removed.rowCount ?? removed.affectedRows ?? 0 };
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}

async function main() {
  const outIndex = process.argv.indexOf('--out');
  const features = await fetchGameLands();
  const rows = toPlaces(features);
  console.log(`Fetched ${features.length} features, ${rows.length} usable game lands.`);

  if (outIndex !== -1) {
    const out = process.argv[outIndex + 1];
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }));
    console.log(`Wrote ${out}`);
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL, or pass --out <file> to only fetch.');
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await upsertPlaces(client, rows);
    console.log(`Upserted ${result.upserted}, deleted ${result.deleted}.`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
