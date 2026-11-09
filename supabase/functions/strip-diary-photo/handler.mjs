/**
 * Request handler for strip-diary-photo. The function owns the write: the
 * client sends the image body plus bucket/path headers; this authenticates
 * the JWT, converts to a cleaned JPEG (or rejects), and stores only that.
 * Injectable deps so Node tests can cover this without Deno or hosted Storage.
 */
import { authorizeObjectPath, PathAuthError } from './objectPath.mjs';
import { MAX_PHOTO_BYTES, toCleanJpeg, UnsupportedImageError } from './imageKind.mjs';

/**
 * @typedef {object} StripDeps
 * @property {(token: string) => Promise<{ id: string } | null>} getUser
 * @property {(bucket: string, path: string, body: Uint8Array) => Promise<void>} upload
 */

function bearerToken(req) {
  const raw = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const m = /^Bearer\s+(\S+)/i.exec(raw);
  return m ? m[1] : null;
}

/**
 * @param {Request} req
 * @param {StripDeps} deps
 * @returns {Promise<Response>}
 */
export async function handleStripRequest(req, deps) {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const token = bearerToken(req);
  if (!token) {
    return new Response('missing authorization', { status: 401 });
  }

  let user;
  try {
    user = await deps.getUser(token);
  } catch {
    return new Response('invalid authorization', { status: 401 });
  }
  if (!user || typeof user.id !== 'string' || user.id.length === 0) {
    return new Response('invalid authorization', { status: 401 });
  }

  const bucket = req.headers.get('x-birdbrain-bucket');
  const path = req.headers.get('x-birdbrain-path');

  let authorized;
  try {
    authorized = authorizeObjectPath(bucket, path, user.id);
  } catch (e) {
    if (e instanceof PathAuthError) {
      return new Response(e.message, { status: e.status });
    }
    throw e;
  }

  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength === 0) {
    return new Response('expected image body', { status: 400 });
  }
  if (raw.byteLength > MAX_PHOTO_BYTES) {
    return new Response('image too large', { status: 413 });
  }

  let cleaned;
  try {
    cleaned = toCleanJpeg(raw);
  } catch (e) {
    if (e instanceof UnsupportedImageError) {
      return new Response(e.message, { status: 415 });
    }
    const msg = e instanceof Error ? e.message : 'strip failed';
    const status = msg === 'not a JPEG' ? 415 : 400;
    return new Response(msg, { status });
  }

  await deps.upload(authorized.bucket, authorized.path, cleaned);
  return new Response(JSON.stringify({ ok: true, bucket: authorized.bucket, path: authorized.path }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-birdbrain-exif-stripped': '1',
    },
  });
}
