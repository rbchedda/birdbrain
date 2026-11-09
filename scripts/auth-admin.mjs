// Auth admin helpers for smoke/E2E user provisioning.
// Prefer this over INSERT into auth.users / auth.identities (M4).
//
// Uses the GoTrue Admin API (POST/DELETE /auth/v1/admin/users) with a
// short-lived or scoped key in SUPABASE_AUTH_ADMIN_KEY, falling back to
// SUPABASE_SERVICE_ROLE_KEY. Never logs the key or the password.
//
// A Management API PAT (SUPABASE_ACCESS_TOKEN) is not enough for this
// path and must not be used to insert into auth.users.

const adminKey = () => process.env.SUPABASE_AUTH_ADMIN_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export function authAdminConfigured() {
  return Boolean(process.env.SUPABASE_URL && adminKey());
}

function headers(key) {
  return { Authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json' };
}

async function readError(res) {
  const t = await res.text();
  return `${res.status} ${t.slice(0, 200)}`;
}

/** Create a confirmed email user. Returns { id, email, password }. */
export async function adminCreateUser({ url = process.env.SUPABASE_URL, key = adminKey(), email, password, fetchImpl = fetch } = {}) {
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_AUTH_ADMIN_KEY (or SUPABASE_SERVICE_ROLE_KEY) for Auth admin user creation.');
  const res = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`auth admin createUser failed: ${await readError(res)}`);
  const body = await res.json();
  if (!body?.id) throw new Error('auth admin createUser returned no id');
  return { id: body.id, email, password };
}

export async function adminDeleteUser({ url = process.env.SUPABASE_URL, key = adminKey(), id, fetchImpl = fetch } = {}) {
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_AUTH_ADMIN_KEY (or SUPABASE_SERVICE_ROLE_KEY) for Auth admin user deletion.');
  if (!id) throw new Error('adminDeleteUser requires id');
  const res = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(key),
  });
  // 404: already gone (idempotent cleanup).
  if (!res.ok && res.status !== 404) throw new Error(`auth admin deleteUser failed: ${await readError(res)}`);
}

export async function adminGetUser({ url = process.env.SUPABASE_URL, key = adminKey(), id, fetchImpl = fetch } = {}) {
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_AUTH_ADMIN_KEY (or SUPABASE_SERVICE_ROLE_KEY) to look up a user.');
  const res = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: headers(key),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`auth admin getUser failed: ${await readError(res)}`);
  return res.json();
}
