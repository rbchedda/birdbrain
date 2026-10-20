import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createTestDb } from '../supabase/tests/db.mjs';
import { fetchGameLands, SOURCE, toPlaces, upsertPlaces } from './game-lands.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/two-game-lands.geojson', import.meta.url)));

// Serves the fixture one feature per page (a server cap below our page size), flagging exceededTransferLimit like ArcGIS does.
function pagedFetch() {
  const calls = [];
  const fetchImpl = async (url) => {
    const offset = Number(new URL(url).searchParams.get('resultOffset'));
    calls.push(offset);
    const features = fixture.features.slice(offset, offset + 1);
    const exceededTransferLimit = offset + 1 < fixture.features.length;
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features, exceededTransferLimit }) };
  };
  return { fetchImpl, calls };
}

describe('fetchGameLands', () => {
  it('follows pagination until the server stops flagging more results', async () => {
    const { fetchImpl, calls } = pagedFetch();
    const features = await fetchGameLands({ fetchImpl });
    assert.equal(features.length, 2);
    assert.deepEqual(calls, [0, 1]);
  });

  it('surfaces ArcGIS errors', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ error: { code: 400, message: 'bad' } }) });
    await assert.rejects(fetchGameLands({ fetchImpl }), /PASDA query error/);
  });
});

describe('toPlaces', () => {
  it('names game lands by number and keeps source metadata', () => {
    const rows = toPlaces(fixture.features);
    assert.deepEqual(rows.map((r) => [r.source_id, r.name]), [
      ['12', 'State Game Lands 12'],
      ['24', 'State Game Lands 24'],
    ]);
    assert.equal(JSON.parse(rows[0].properties).sgl, 12);
    assert.match(rows[0].source_updated_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('skips features without geometry or an SGL number', () => {
    assert.equal(toPlaces([{ properties: { SGL: 1 }, geometry: null }, { properties: {}, geometry: {} }]).length, 0);
  });
});

describe('upsertPlaces', () => {
  it('inserts, updates in place, and removes game lands dropped from the source', async () => {
    const db = await createTestDb();
    const rows = toPlaces(fixture.features);

    assert.deepEqual(await upsertPlaces(db, rows), { upserted: 2, deleted: 0 });
    const first = await db.query(
      `select source_id, id, extensions.geometrytype(geom) t, extensions.st_isvalid(geom) valid,
              extensions.st_y(centroid) lat
         from public.places where source = $1 order by source_id::int`,
      [SOURCE],
    );
    assert.equal(first.rows.length, 2);
    for (const r of first.rows) {
      assert.equal(r.t, 'MULTIPOLYGON');
      assert.equal(r.valid, true);
      assert.ok(r.lat > 39.7 && r.lat < 42.3, `centroid latitude ${r.lat} should be inside PA`);
    }

    const renamed = rows.slice(0, 1).map((r) => ({ ...r, name: 'State Game Lands 12 (renamed)' }));
    assert.deepEqual(await upsertPlaces(db, renamed), { upserted: 1, deleted: 1 });
    const after = await db.query('select id, name from public.places where source = $1', [SOURCE]);
    assert.deepEqual(after.rows, [{ id: first.rows[0].id, name: 'State Game Lands 12 (renamed)' }]);
  });
});
