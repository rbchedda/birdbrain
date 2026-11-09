/**
 * Request handler for strip-diary-photo. Injectable deps so Node tests can
 * cover JWT, path and strip logic without Deno or a live Supabase project.
 */
import { authorizeObjectPath, PathAuthError } from './objectPath.mjs';
import { stripJpegMetadata } from './stripJpegMetadata.mjs';

/**
 * @typedef {object} StripDeps
 * @property {(token: string) => Promise<{ id: string } | null>} getUser
 * @property {(bucket: string, path: string) => Promise<Uint8Array | null>} download
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

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('expected json body', { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return new Response('expected json body', { status: 400 });
  }

  let authorized;
  try {
    authorized = authorizeObjectPath(body.bucket, body.path, user.id);
  } catch (e) {
    if (e instanceof PathAuthError) {
      return new Response(e.message, { status: e.status });
    }
    throw e;
  }

  const raw = await deps.download(authorized.bucket, authorized.path);
  if (!raw) {
    return new Response('object not found', { status: 404 });
  }

  let cleaned;
  try {
    cleaned = stripJpegMetadata(raw);
  } catch (e) {
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
