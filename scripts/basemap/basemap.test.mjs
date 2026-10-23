import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

process.env.BASEMAP_OUT = join(tmpdir(), `basemap-test-${process.pid}`);
const { PA_BBOX, tilesFor } = await import('./common.mjs');
const { server } = await import('./serve.mjs');

describe('PA tile ranges', () => {
  it('covers Pennsylvania only, one tile at z0 and a few thousand by z12', () => {
    assert.equal(tilesFor(PA_BBOX, 0, 0).length, 1);
    const z12 = tilesFor(PA_BBOX, 12, 12);
    assert.ok(z12.length > 1500 && z12.length < 5000, String(z12.length));
    // Pittsburgh and Philadelphia are inside; Cleveland is not.
    const has = (lon, lat) => z12.some(({ x, y }) => x === Math.floor(((lon + 180) / 360) * 4096) &&
      y === Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 4096));
    assert.ok(has(-79.99, 40.44) && has(-75.16, 39.95));
    assert.ok(!has(-81.69, 41.5));
  });
});

describe('dev asset server', () => {
  let base;
  before(async () => {
    await mkdir(join(process.env.BASEMAP_OUT, 'basemap'), { recursive: true });
    await writeFile(join(process.env.BASEMAP_OUT, 'basemap', 'pa.pmtiles'), Buffer.from('0123456789'));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  it('serves byte ranges with CORS (PMTiles needs both)', async () => {
    const res = await fetch(`${base}/basemap/pa.pmtiles`, { headers: { Range: 'bytes=2-5' } });
    assert.equal(res.status, 206);
    assert.equal(await res.text(), '2345');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(res.headers.get('content-range'), 'bytes 2-5/10');
  });

  it('refuses paths outside the output dir', async () => {
    assert.equal((await fetch(`${base}/../package.json`)).status, 404);
    assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).status, 404);
  });
});
