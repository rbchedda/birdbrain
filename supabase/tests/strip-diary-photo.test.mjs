import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleStripRequest } from '../functions/strip-diary-photo/handler.mjs';
import { authorizeObjectPath, normalizeObjectPath, PathAuthError } from '../functions/strip-diary-photo/objectPath.mjs';
import { jpegHasGpsExif, stripJpegMetadata } from '../functions/strip-diary-photo/stripJpegMetadata.mjs';
import { buildGpsJpeg } from './gpsJpegFixture.mjs';


const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function jsonReq({ token, bucket, path, method = 'POST', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token !== undefined) headers.authorization = token === '' ? '' : `Bearer ${token}`;
  return new Request('http://functions/strip-diary-photo', {
    method,
    headers,
    body: body === undefined ? JSON.stringify({ bucket, path }) : body,
  });
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
    // Well-formed paths that still must not authorize for this caller
    assert.throws(() => authorizeObjectPath('diary-photos', `${UID}`, UID), /invalid path/);
    assert.throws(() => authorizeObjectPath('diary-photos', `${UID}x/p.jpg`, UID), /not in the caller folder/);
    assert.throws(() => authorizeObjectPath('diary-photos', `${UID}-x/p.jpg`, UID), /not in the caller folder/);
  });
});

describe('handleStripRequest', () => {
  const tagged = buildGpsJpeg();
  assert.equal(jpegHasGpsExif(tagged), true);

  function deps(store, { getUser } = {}) {
    return {
      getUser: getUser ?? (async (token) => (token === 'good' ? { id: UID } : token === 'bad' ? null : null)),
      async download(bucket, path) {
        const key = `${bucket}:${path}`;
        return store.has(key) ? store.get(key) : null;
      },
      async upload(bucket, path, body) {
        store.set(`${bucket}:${path}`, body);
      },
    };
  }

  it('strips GPS EXIF from a stored diary-photos object and writes only the cleaned bytes', async () => {
    const path = `${UID}/entry/p.jpg`;
    const store = new Map([[`diary-photos:${path}`, tagged]]);
    const res = await handleStripRequest(jsonReq({ token: 'good', bucket: 'diary-photos', path }), deps(store));
    assert.equal(res.status, 200);
    const cleaned = store.get(`diary-photos:${path}`);
    assert.equal(jpegHasGpsExif(cleaned), false);
    assert.equal(Buffer.from(cleaned).toString('binary').includes('Exif'), false);
    assert.equal(cleaned[0], 0xff);
    assert.equal(cleaned[1], 0xd8);
    // Original tagged bytes must not still be stored
    assert.notEqual(cleaned.length, tagged.length);
  });

  it('strips GPS EXIF from a stored post-photos object', async () => {
    const path = `${UID}/p.jpg`;
    const store = new Map([[`post-photos:${path}`, tagged]]);
    const res = await handleStripRequest(jsonReq({ token: 'good', bucket: 'post-photos', path }), deps(store));
    assert.equal(res.status, 200);
    assert.equal(jpegHasGpsExif(store.get(`post-photos:${path}`)), false);
  });

  it('rejects a missing JWT', async () => {
    const res = await handleStripRequest(jsonReq({ bucket: 'diary-photos', path: `${UID}/p.jpg` }), deps(new Map()));
    assert.equal(res.status, 401);
  });

  it('rejects an invalid JWT', async () => {
    const res = await handleStripRequest(
      jsonReq({ token: 'nope', bucket: 'diary-photos', path: `${UID}/p.jpg` }),
      deps(new Map(), { getUser: async () => null }),
    );
    assert.equal(res.status, 401);
  });

  it('rejects a JWT whose getUser throws', async () => {
    const res = await handleStripRequest(
      jsonReq({ token: 'boom', bucket: 'diary-photos', path: `${UID}/p.jpg` }),
      deps(new Map(), { getUser: async () => { throw new Error('bad token'); } }),
    );
    assert.equal(res.status, 401);
  });

  it('rejects a non-owner path', async () => {
    const path = `${OTHER}/p.jpg`;
    const store = new Map([[`diary-photos:${path}`, tagged]]);
    const res = await handleStripRequest(jsonReq({ token: 'good', bucket: 'diary-photos', path }), deps(store));
    assert.equal(res.status, 403);
    assert.equal(store.get(`diary-photos:${path}`), tagged, 'must not rewrite another user object');
  });

  it('rejects path traversal', async () => {
    const res = await handleStripRequest(
      jsonReq({ token: 'good', bucket: 'diary-photos', path: `${UID}/../${OTHER}/p.jpg` }),
      deps(new Map()),
    );
    assert.equal(res.status, 400);
  });

  it('rejects a wrong bucket', async () => {
    const res = await handleStripRequest(jsonReq({ token: 'good', bucket: 'avatars', path: `${UID}/p.jpg` }), deps(new Map()));
    assert.equal(res.status, 403);
  });
});
