import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createTestDb } from '../supabase/tests/db.mjs';
import { cropsIn, fetchFeatures, ingestSource, missingFields, pick, SOURCES, toRows, upsertRows } from './arcgis.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const gameLands = fixture('two-game-lands.geojson');
// Schemas and sample rows captured from the live PGC layers (see the file's note).
const live = fixture('pgc-live-sample.json').sources;
const byName = (features, key, value) => features.find((f) => f.properties[key] === value);

const stockingFeatures = ['101', 'Beltzville State Park'].map((n) => byName(live.pheasant_stocking.features, 'property_name', n));
const doveFeatures = [byName(live.dove_fields.features, 'OBJECTID', 47)]; // "SGL 169"

/** Fake ArcGIS server: layer metadata at ?f=json, paged GeoJSON at /query. */
function fakeServer(layers, { pageCap = 1 } = {}) {
  const calls = [];
  const fetchImpl = async (raw) => {
    const url = new URL(raw);
    calls.push(url.pathname + url.search);
    const base = Object.keys(layers).find((k) => raw.startsWith(k));
    const layer = layers[base];
    if (!layer) return { ok: false, status: 404, statusText: 'Not Found' };
    if (url.pathname.endsWith('/query')) {
      const offset = Number(url.searchParams.get('resultOffset'));
      const count = Math.min(Number(url.searchParams.get('resultRecordCount')), pageCap);
      const features = layer.features.slice(offset, offset + count);
      return { ok: true, json: async () => ({ type: 'FeatureCollection', features,
        exceededTransferLimit: offset + count < layer.features.length }) };
    }
    return { ok: true, json: async () => ({ name: 'x', geometryType: 'esriGeometryPoint', maxRecordCount: 2000,
      editingInfo: { lastEditDate: layer.lastEditDate }, fields: [{ name: 'OBJECTID', type: 'esriFieldTypeOID' }] }) };
  };
  return { fetchImpl, calls };
}

describe('pick', () => {
  it('matches field names case-insensitively and skips empty values', () => {
    assert.equal(pick({ Property_Type: 'SGL', county: '' }, 'COUNTY', 'property_type'), 'SGL');
    assert.equal(pick({}, 'X'), null);
  });
});

describe('fetchFeatures', () => {
  it('follows pagination when the server caps pages', async () => {
    const { fetchImpl, calls } = fakeServer({ 'https://x/L': { features: stockingFeatures } });
    const features = await fetchFeatures('https://x/L', { fetchImpl });
    assert.equal(features.length, 2);
    assert.equal(calls.length, 2);
  });

  it('times out a hung request instead of waiting forever', async () => {
    const fetchImpl = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    await assert.rejects(fetchFeatures('https://x/L', { fetchImpl, timeoutMs: 20 }), /timed out after 20 ms/);
  });

  it('surfaces ArcGIS errors', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ error: { code: 400, message: 'bad' } }) });
    await assert.rejects(fetchFeatures('https://x/L', { fetchImpl }), /ArcGIS error/);
  });
});

describe('live schema', () => {
  for (const [name, config] of Object.entries(SOURCES)) {
    it(`${name} reads only fields the live layer has`, () => {
      assert.ok(live[name], `no captured schema for ${name}`);
      assert.equal(live[name].layerUrl, config.layerUrl);
      assert.deepEqual(missingFields(config, live[name].fields), []);
    });
  }

  it('flags mapped fields that disappear upstream', () => {
    assert.deepEqual(missingFields(SOURCES.dove_fields, [{ name: 'GlobalID' }]),
      ['Project_Name', 'Project_Area', 'Description', 'Active', 'last_edited_date']);
  });
});

describe('toRows', () => {
  it('maps game lands by SGL number and merges split parcels', () => {
    const split = [...gameLands.features, { ...gameLands.features[0], properties: { ...gameLands.features[0].properties, gis_area_ac: 100 } }];
    const rows = toRows(SOURCES.game_lands, split);
    assert.deepEqual(rows.map((r) => [r.source_id, r.name]), [['12', 'State Game Lands 12'], ['24', 'State Game Lands 24']]);
    assert.equal(JSON.parse(rows[0].geojson).type, 'GeometryCollection');
    assert.equal(rows[0].acres, Math.round((24597.6 + 100) * 10) / 10);
  });

  it('reads game land acres, region, status and edit date from the live field names', () => {
    const row = toRows(SOURCES.game_lands, gameLands.features)[1];
    assert.equal(row.acres, 8585.2); // gis_area_ac, not Shape__Area (Web Mercator square metres)
    assert.equal(row.county, null); // the layer has no county
    assert.equal(row.source_updated_at, '2026-10-19T14:48:24.000Z');
    assert.deepEqual(JSON.parse(row.properties), { sgl: 24, pgc_region: 'Northwest', status: 'Active', raw: gameLands.features[1].properties });
  });

  it('keys stocking points by property and names game lands in full', () => {
    const rows = toRows(SOURCES.pheasant_stocking, live.pheasant_stocking.features);
    const ids = Object.fromEntries(rows.map((r) => [r.source_id, r]));
    assert.deepEqual(Object.keys(ids).sort(),
      ['name:beltzville-state-park', 'name:jeffers-tree-farm', 'sgl:101', 'sgl:155', 'sgl:65']);
    assert.equal(ids['sgl:101'].name, 'State Game Lands 101');
    assert.equal(ids['sgl:155'].name, 'State Game Lands 155'); // property_type is null upstream
    assert.equal(ids['name:beltzville-state-park'].name, 'Beltzville State Park');
    const p = JSON.parse(ids['sgl:101'].properties);
    assert.deepEqual({ ...p, raw: undefined }, {
      sgl: 101, pgc_region: 'Northwest', property_type: 'SGL', late_season: false, number_releases: 6,
      total_released: 360, globalid: '02d7cb09-b6ea-4f2a-9a27-7ce5342be0ab', raw: undefined,
    });
    assert.equal(p.raw.late_season_status, 'No Late Season Stocking');
  });

  it('reads late-season status as a boolean and keeps unknown counts null', () => {
    const rows = Object.fromEntries(toRows(SOURCES.pheasant_stocking, live.pheasant_stocking.features)
      .map((r) => [r.source_id, JSON.parse(r.properties)]));
    assert.equal(rows['name:beltzville-state-park'].late_season, true);
    assert.equal(rows['sgl:65'].number_releases, null);
    assert.equal(rows['name:jeffers-tree-farm'].total_released, null);
  });

  it('maps dove fields from Project_Name, Project_Area and Description', () => {
    const rows = Object.fromEntries(toRows(SOURCES.dove_fields, live.dove_fields.features)
      .map((r) => [JSON.parse(r.properties).raw.OBJECTID, r]));
    assert.equal(Object.keys(rows).length, 8);
    assert.equal(rows[47].name, 'SGL 169 dove field');
    assert.equal(rows[47].acres, 18.6);
    assert.deepEqual(JSON.parse(rows[47].properties).crops, ['sunflower', 'wheat']);
    assert.equal(rows[42].name, 'Dove field 252'); // renamed from the SGL it overlaps on upsert
    assert.equal(rows[203].name, 'Beltzville dove field');
    assert.equal(rows[398].name, 'King Farm Dove Fields');
    assert.equal(rows[204].name, 'Dove field');
    assert.equal(rows[417].acres, null); // Project_Area blank upstream; filled from geometry on upsert
    assert.equal(JSON.parse(rows[239].properties).project_name, '411');
  });

  it('skips dove fields marked inactive', () => {
    const f = live.dove_fields.features[0];
    assert.equal(toRows(SOURCES.dove_fields, [{ ...f, properties: { ...f.properties, Active: 'N' } }]).length, 0);
  });

  it('finds crops in free-text descriptions', () => {
    assert.deepEqual(cropsIn('planted in wheat, sunflower, and brown-top millet'), ['sunflower', 'wheat', 'millet']);
    assert.deepEqual(cropsIn('Primarily winter wheat. ... small grains'), ['wheat', 'small grains']);
    assert.deepEqual(cropsIn(null), []);
  });

  it('skips features without geometry or an id', () => {
    assert.equal(toRows(SOURCES.game_lands, [{ properties: { sgl: 1 }, geometry: null }, { properties: {}, geometry: {} }]).length, 0);
  });
});

describe('upsertRows', () => {
  it('stores polygons as valid multipolygons and points as points', async () => {
    const db = await createTestDb();
    await upsertRows(db, SOURCES.game_lands, toRows(SOURCES.game_lands, gameLands.features));
    await upsertRows(db, SOURCES.pheasant_stocking, toRows(SOURCES.pheasant_stocking, stockingFeatures));
    await upsertRows(db, SOURCES.dove_fields, toRows(SOURCES.dove_fields, doveFeatures));
    const { rows } = await db.query(
      `select type::text, extensions.geometrytype(geom) g, bool_and(extensions.st_isvalid(geom)) valid, count(*)::int n,
              min(species::text) sp
         from public.places group by 1, 2 order by 1`,
    );
    assert.deepEqual(rows, [
      { type: 'game_land', g: 'MULTIPOLYGON', valid: true, n: 2, sp: '{}' },
      { type: 'stocking', g: 'POINT', valid: true, n: 2, sp: '{pheasant}' },
      { type: 'dove_field', g: 'MULTIPOLYGON', valid: true, n: 1, sp: '{dove}' },
    ].sort((a, b) => a.type.localeCompare(b.type)));
  });

  it('tags dove fields with the game land they overlap and fills blank acreage', async () => {
    const db = await createTestDb();
    const doves = [42, 239, 417].map((id) => byName(live.dove_fields.features, 'OBJECTID', id));
    // A stand-in SGL 252 polygon covering the "252" field (OBJECTID 42) only.
    const [x0, y0] = doves[0].geometry.coordinates[0][0];
    const [x1, y1] = doves[0].geometry.coordinates[0][2];
    const sgl252 = { type: 'Feature', properties: { ...gameLands.features[0].properties, sgl: 252 },
      geometry: { type: 'Polygon', coordinates: [[[x0 - 0.01, y0 - 0.01], [x1 + 0.01, y0 - 0.01], [x1 + 0.01, y1 + 0.01], [x0 - 0.01, y1 + 0.01], [x0 - 0.01, y0 - 0.01]]] } };
    await upsertRows(db, SOURCES.game_lands, toRows(SOURCES.game_lands, [sgl252]));
    await upsertRows(db, SOURCES.dove_fields, toRows(SOURCES.dove_fields, doves));
    const { rows } = await db.query(
      `select properties -> 'raw' ->> 'OBJECTID' oid, name, (properties ->> 'sgl')::int sgl, acres::float
         from public.places where type = 'dove_field' order by 1`,
    );
    assert.deepEqual(rows.map(({ oid, name, sgl }) => [oid, name, sgl]), [
      ['239', 'Dove field 411', null], // "411" is not a game land number
      ['417', 'Dove field 285', null],
      ['42', 'SGL 252 dove field', 252],
    ]);
    const acres = Object.fromEntries(rows.map((r) => [r.oid, r.acres]));
    assert.equal(acres[42], 27.6); // Project_Area as published
    assert.ok(acres[417] > 0, 'blank Project_Area is computed from the geometry');
  });

  it('updates in place and deletes features dropped upstream', async () => {
    const db = await createTestDb();
    const rows = toRows(SOURCES.pheasant_stocking, stockingFeatures);
    await upsertRows(db, SOURCES.pheasant_stocking, rows);
    const before = await db.query(`select id from public.places where source_id = 'sgl:101'`);
    const result = await upsertRows(db, SOURCES.pheasant_stocking, [{ ...rows[0], name: 'Renamed' }]);
    assert.deepEqual(result, { upserted: 1, deleted: 1 });
    const after = await db.query('select id, name from public.places');
    assert.deepEqual(after.rows, [{ id: before.rows[0].id, name: 'Renamed' }]);
  });
});

describe('ingestSource', () => {
  it('skips a layer whose lastEditDate has not moved, and reruns when it does', async () => {
    const db = await createTestDb();
    const layers = { [SOURCES.pheasant_stocking.layerUrl]: { features: stockingFeatures, lastEditDate: 1_790_000_000_000 } };
    const { fetchImpl } = fakeServer(layers, { pageCap: 1000 });

    const first = await ingestSource(db, SOURCES.pheasant_stocking, { fetchImpl });
    assert.equal(first.upserted, 2);
    const second = await ingestSource(db, SOURCES.pheasant_stocking, { fetchImpl });
    assert.equal(second.skipped, true);

    layers[SOURCES.pheasant_stocking.layerUrl].lastEditDate += 60_000;
    const third = await ingestSource(db, SOURCES.pheasant_stocking, { fetchImpl });
    assert.equal(third.upserted, 2);
    const state = await db.query('select feature_count from public.ingest_state');
    assert.equal(state.rows[0].feature_count, 2);
  });

  it('refuses to wipe a table when the layer comes back empty or unmappable', async () => {
    const db = await createTestDb();
    const url = SOURCES.dove_fields.layerUrl;
    await assert.rejects(
      ingestSource(db, SOURCES.dove_fields, { fetchImpl: fakeServer({ [url]: { features: [], lastEditDate: 1 } }).fetchImpl }),
      /refusing to delete/,
    );
    const junk = [{ type: 'Feature', geometry: doveFeatures[0].geometry, properties: { foo: 1 } }];
    await assert.rejects(
      ingestSource(db, SOURCES.dove_fields, { fetchImpl: fakeServer({ [url]: { features: junk, lastEditDate: 1 } }).fetchImpl }),
      /0 usable rows/,
    );
  });
});
