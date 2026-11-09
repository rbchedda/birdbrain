import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleStripRequest } from '../functions/strip-diary-photo/handler.mjs';
import { authorizeObjectPath, normalizeObjectPath, PathAuthError } from '../functions/strip-diary-photo/objectPath.mjs';
import { jpegHasGpsExif } from '../functions/strip-diary-photo/stripJpegMetadata.mjs';
import { buildGpsJpeg } from './gpsJpegFixture.mjs';

const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/** Minimal PNG signature + IHDR-ish bytes (not a complete image; used to test rejection). */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
/** ISO-BMFF ftyp/heic box so detectImageKind returns heic. */
const HEIC = Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00]);
/** RIFF/WEBP header. */
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

function imageReq({ token, bucket, path, body, method = 'POST' } = {}) {
  const headers = {};
  if (token !== undefined) headers.authorization = token === '' ? '' : `Bearer ${token}`;
  if (bucket !== undefined) headers['x-birdbrain-bucket'] = bucket;
  if (path !== undefined) headers['x-birdbrain-path'] = path;
  return new Request('http://functions/strip-diary-photo', { method, headers, body });
}

describe('normalizeObjectPath / authorizeObjectPath', () => {
  it('accepts a normal owner path in either allowed bucket', () => {
    for (const bucket of ['diary-photos', 'post-photos']) {
      const got = authorizeObjectPath(bucket, `${UID}/entry/p.jpg`, UID);
      assert.deepEqual(got, { bucket, path: `${UID}/entry/p.jpg` });
    }
  });

  it('rejects a missing JWT user, a non-owner path, and a wrong bucket', () => {
    assert.throws(() => authorizeObjectPath('diary-photos', `${UID}/p.jpg`, ''), /invalid user/);
    assert.throws(() => authorizeObjectPath('diary-photos', `${OTHER}/p.jpg`, UID), (e) => e instanceof PathAuthError && e.status === 403);
    assert.throws(() => authorizeObjectPath('avatars', `${UID}/p.jpg`, UID), (e) => e instanceof PathAuthError && e.status === 403);
    assert.throws(() => authorizeObjectPath('public', `${UID}/p.jpg`, UID), /bucket not allowed/);
  });

  it('rejects path traversal, absolute paths, encoding tricks and prefix spoofs', () => {
    const malformed = [
      `${UID}/../${OTHER}/p.jpg`,
      `../${UID}/p.jpg`,
      `${UID}/foo/../../${OTHER}/p.jpg`,
      `${UID}/./p.jpg`,
      `${UID}//p.jpg`,
      `/${UID}/p.jpg`,
      `//${UID}/p.jpg`,
      `${UID}\\p.jpg`,
      `${UID}/%2e%2e/${OTHER}/p.jpg`,
      `${UID}%2f${OTHER}/p.jpg`,
      '',
      '   ',
      `${UID}/p.jpg\0.jpg`,
      `file://${UID}/p.jpg`,
      `C:/${UID}/p.jpg`,
    ];
    for (const path of malformed) {
      assert.throws(() => normalizeObjectPath(path), PathAuthError, `should reject ${JSON.stringify(path)}`);
    }
    assert.throws(() => authorizeObjectPath('diary-photos', `${UID}`, UID), /invalid path/);
    assert.throws(() => authorizeObjectPath('diary-photos', `${UID}x/p.jpg`, UID), /not in the caller folder/);
    assert.throws(() => authorizeObjectPath('diary-photos', `${UID}-x/p.jpg`, UID), /not in the caller folder/);
  });
});

describe('handleStripRequest (function owns the write)', () => {
  const tagged = buildGpsJpeg();
  assert.equal(jpegHasGpsExif(tagged), true);

  function deps(store, { getUser } = {}) {
    return {
      getUser: getUser ?? (async (token) => (token === 'good' ? { id: UID } : null)),
      async upload(bucket, path, body) {
        store.set(`${bucket}:${path}`, body);
      },
    };
  }

  it('stores a GPS JPEG with no EXIF and never keeps the raw bytes', async () => {
    const path = `${UID}/entry/p.jpg`;
    const store = new Map();
    const res = await handleStripRequest(
      imageReq({ token: 'good', bucket: 'diary-photos', path, body: tagged }),
      deps(store),
    );
    assert.equal(res.status, 200);
    const cleaned = store.get(`diary-photos:${path}`);
    assert.ok(cleaned, 'cleaned object must be stored');
    assert.equal(jpegHasGpsExif(cleaned), false);
    assert.equal(Buffer.from(cleaned).toString('binary').includes('Exif'), false);
    assert.equal(cleaned[0], 0xff);
    assert.equal(cleaned[1], 0xd8);
    assert.notEqual(cleaned.length, tagged.length);
  });

  it('stores a cleaned JPEG in post-photos', async () => {
    const path = `${UID}/p.jpg`;
    const store = new Map();
    const res = await handleStripRequest(
      imageReq({ token: 'good', bucket: 'post-photos', path, body: tagged }),
      deps(store),
    );
    assert.equal(res.status, 200);
    assert.equal(jpegHasGpsExif(store.get(`post-photos:${path}`)), false);
  });

  it('rejects a non-JPEG (PNG, WebP, HEIC) and stores nothing', async () => {
    const path = `${UID}/p.jpg`;
    for (const [kind, body] of [['PNG', PNG], ['WEBP', WEBP], ['HEIC', HEIC]]) {
      const store = new Map();
      const res = await handleStripRequest(
        imageReq({ token: 'good', bucket: 'diary-photos', path, body }),
        deps(store),
      );
      assert.equal(res.status, 415, kind);
      assert.match(await res.text(), /not accepted|only a cleaned JPEG/i);
      assert.equal(store.size, 0, `${kind} must not be stored`);
    }
  });

  it('rejects a missing JWT and stores nothing', async () => {
    const store = new Map();
    const res = await handleStripRequest(
      imageReq({ bucket: 'diary-photos', path: `${UID}/p.jpg`, body: tagged }),
      deps(store),
    );
    assert.equal(res.status, 401);
    assert.equal(store.size, 0);
  });

  it('rejects an invalid JWT and stores nothing', async () => {
    const store = new Map();
    const res = await handleStripRequest(
      imageReq({ token: 'nope', bucket: 'diary-photos', path: `${UID}/p.jpg`, body: tagged }),
      deps(store, { getUser: async () => null }),
    );
    assert.equal(res.status, 401);
    assert.equal(store.size, 0);
  });

  it('rejects a JWT whose getUser throws and stores nothing', async () => {
    const store = new Map();
    const res = await handleStripRequest(
      imageReq({ token: 'boom', bucket: 'diary-photos', path: `${UID}/p.jpg`, body: tagged }),
      deps(store, { getUser: async () => { throw new Error('bad token'); } }),
    );
    assert.equal(res.status, 401);
    assert.equal(store.size, 0);
  });

  it('rejects a non-owner path and stores nothing', async () => {
    const path = `${OTHER}/p.jpg`;
    const store = new Map();
    const res = await handleStripRequest(
      imageReq({ token: 'good', bucket: 'diary-photos', path, body: tagged }),
      deps(store),
    );
    assert.equal(res.status, 403);
    assert.equal(store.size, 0);
  });

  it('rejects path traversal and stores nothing', async () => {
    const store = new Map();
    const res = await handleStripRequest(
      imageReq({ token: 'good', bucket: 'diary-photos', path: `${UID}/../${OTHER}/p.jpg`, body: tagged }),
      deps(store),
    );
    assert.equal(res.status, 400);
    assert.equal(store.size, 0);
  });

  it('rejects a wrong bucket and stores nothing', async () => {
    const store = new Map();
    const res = await handleStripRequest(
      imageReq({ token: 'good', bucket: 'avatars', path: `${UID}/p.jpg`, body: tagged }),
      deps(store),
    );
    assert.equal(res.status, 403);
    assert.equal(store.size, 0);
  });
});
