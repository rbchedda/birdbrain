import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createTestDb } from '../supabase/tests/db.mjs';
import { fetchFeatures, ingestSource, pick, SOURCES, toRows, upsertRows } from './arcgis.mjs';

const gameLands = JSON.parse(readFileSync(new URL('./fixtures/two-game-lands.geojson', import.meta.url)));

const stockingFeatures = [
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-75.95, 40.45] },
    properties: { OBJECTID: 1, GlobalID: '{A1}', Property: 'SGL 110', County: 'Berks', Region: 'Southeast',
      Property_Type: 'State Game Lands', Number_Releases: 9, Total_Released: 1200, Late_Season_Status: 'Yes' },
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-77.86, 40.79] },
    properties: { OBJECTID: 2, GlobalID: '{B2}', Property: 'SGL 176', County: 'Centre', Region: 'Southcentral',
      Property_Type: 'State Game Lands', Number_Releases: 6, Total_Released: 800, Late_Season_Status: 'No' },
  },
];

const doveFeatures = [
  {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[-76.7, 39.95], [-76.69, 39.95], [-76.69, 39.96], [-76.7, 39.96], [-76.7, 39.95]]] },
    properties: { OBJECTID: 7, SGL: 243, County: 'York', Crop: 'Sunflower', Acres: 12.5 },
  },
];

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

  it('surfaces ArcGIS errors', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ error: { code: 400, message: 'bad' } }) });
    await assert.rejects(fetchFeatures('https://x/L', { fetchImpl }), /ArcGIS error/);
  });
});

describe('toRows', () => {
  it('maps game lands by SGL number and merges split parcels', () => {
    const split = [...gameLands.features, { ...gameLands.features[0], properties: { ...gameLands.features[0].properties, ACRES: 100 } }];
    const rows = toRows(SOURCES.game_lands, split);
    assert.deepEqual(rows.map((r) => [r.source_id, r.name]), [['12', 'State Game Lands 12'], ['24', 'State Game Lands 24']]);
    assert.equal(JSON.parse(rows[0].geojson).type, 'GeometryCollection');
    assert.equal(rows[0].acres, Math.round((24598.795567599998 + 100) * 10) / 10);
  });

  it('maps stocking points and keeps raw attributes', () => {
    const [row] = toRows(SOURCES.pheasant_stocking, stockingFeatures);
    assert.equal(row.source_id, '{A1}');
    assert.equal(row.name, 'SGL 110');
    assert.equal(row.county, 'Berks');
    const props = JSON.parse(row.properties);
    assert.equal(props.total_released, 1200);
    assert.equal(props.raw.OBJECTID, 1);
  });

  it('names dove fields from their game land', () => {
    const [row] = toRows(SOURCES.dove_fields, doveFeatures);
    assert.equal(row.name, 'SGL 243 dove field');
    assert.equal(JSON.parse(row.properties).planted, 'Sunflower');
  });

  it('skips features without geometry or an id', () => {
    assert.equal(toRows(SOURCES.game_lands, [{ properties: { SGL: 1 }, geometry: null }, { properties: {}, geometry: {} }]).length, 0);
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

  it('updates in place and deletes features dropped upstream', async () => {
    const db = await createTestDb();
    const rows = toRows(SOURCES.pheasant_stocking, stockingFeatures);
    await upsertRows(db, SOURCES.pheasant_stocking, rows);
    const before = await db.query(`select id from public.places where source_id = '{A1}'`);
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
