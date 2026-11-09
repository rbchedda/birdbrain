/**
 * Authorize a storage object path for strip-diary-photo.
 * Only diary-photos and post-photos; only objects under the caller's own <uid>/ folder.
 */
export const ALLOWED_PHOTO_BUCKETS = Object.freeze(['diary-photos', 'post-photos']);

export class PathAuthError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = 'PathAuthError';
    this.status = status;
  }
}

/**
 * Normalize and validate a storage object path. Rejects traversal, absolute
 * paths, URL-encoding, backslashes, and empty/dot segments. Does not decode
 * percent-escapes — a `%` is rejected so `%2e%2e` / `%2f` cannot sneak through.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeObjectPath(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new PathAuthError(400, 'invalid path');
  }
  if (raw !== raw.trim()) {
    throw new PathAuthError(400, 'invalid path');
  }
  if (raw.includes('\0') || raw.includes('\\') || raw.includes('%') || raw.includes('\\0')) {
    throw new PathAuthError(400, 'invalid path');
  }
  if (raw.startsWith('/') || raw.startsWith('\\')) {
    throw new PathAuthError(400, 'invalid path');
  }
  if (raw.includes('://') || /^[a-zA-Z]:/.test(raw)) {
    throw new PathAuthError(400, 'invalid path');
  }
  const segments = raw.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new PathAuthError(400, 'invalid path');
  }
  return segments.join('/');
}

/**
 * @param {unknown} bucket
 * @param {unknown} rawPath
 * @param {string} uid
 * @returns {{ bucket: string, path: string }}
 */
export function authorizeObjectPath(bucket, rawPath, uid) {
  if (typeof uid !== 'string' || uid.length === 0 || uid.includes('/') || uid.includes('\\') || uid.includes('%') || uid === '.' || uid === '..') {
    throw new PathAuthError(401, 'invalid user');
  }
  if (typeof bucket !== 'string' || !ALLOWED_PHOTO_BUCKETS.includes(bucket)) {
    throw new PathAuthError(403, 'bucket not allowed');
  }
  const path = normalizeObjectPath(rawPath);
  const first = path.split('/')[0];
  // Exact first-segment match, not a string-prefix (rejects `${uid}x/...` and `${uid}-x/...`).
  if (first !== uid) {
    throw new PathAuthError(403, 'path is not in the caller folder');
  }
  if (path.split('/').length < 2) {
    throw new PathAuthError(400, 'invalid path');
  }
  return { bucket, path };
}
