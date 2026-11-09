import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { adminCreateUser, adminDeleteUser, adminGetUser, authAdminConfigured } from './auth-admin.mjs';

const URL_ = 'https://example.supabase.co';
const KEY = 'test-admin-key-not-real';

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, opts, calls);
  };
  return { calls, fetchImpl };
}

const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; },
  async text() { return JSON.stringify(body); },
});

describe('auth-admin', () => {
  it('createUser posts to the Admin API with email_confirm and returns the id', async () => {
    const { calls, fetchImpl } = mockFetch(() => json(200, { id: 'u1' }));
    const out = await adminCreateUser({ url: URL_, key: KEY, email: 'a@example.invalid', password: 'pw', fetchImpl });
    assert.deepEqual(out, { id: 'u1', email: 'a@example.invalid', password: 'pw' });
    assert.equal(calls[0].url, `${URL_}/auth/v1/admin/users`);
    assert.equal(calls[0].opts.method, 'POST');
    assert.equal(calls[0].opts.headers.Authorization, `Bearer ${KEY}`);
    assert.deepEqual(JSON.parse(calls[0].opts.body), { email: 'a@example.invalid', password: 'pw', email_confirm: true });
  });

  it('deleteUser treats 404 as success', async () => {
    const { fetchImpl } = mockFetch(() => json(404, { message: 'not found' }));
    await adminDeleteUser({ url: URL_, key: KEY, id: 'u1', fetchImpl });
  });

  it('getUser returns null on 404', async () => {
    const { fetchImpl } = mockFetch(() => json(404, {}));
    assert.equal(await adminGetUser({ url: URL_, key: KEY, id: 'u1', fetchImpl }), null);
  });

  it('createUser fails clearly when the key is missing', async () => {
    await assert.rejects(
      () => adminCreateUser({ url: URL_, key: '', email: 'a@example.invalid', password: 'pw', fetchImpl: async () => { throw new Error('fetched'); } }),
      /SUPABASE_AUTH_ADMIN_KEY/,
    );
  });

  it('authAdminConfigured reflects env without printing it', () => {
    const prevU = process.env.SUPABASE_URL, prevK = process.env.SUPABASE_AUTH_ADMIN_KEY;
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_AUTH_ADMIN_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(authAdminConfigured(), false);
    process.env.SUPABASE_URL = URL_; process.env.SUPABASE_AUTH_ADMIN_KEY = KEY;
    assert.equal(authAdminConfigured(), true);
    if (prevU === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prevU;
    if (prevK === undefined) delete process.env.SUPABASE_AUTH_ADMIN_KEY; else process.env.SUPABASE_AUTH_ADMIN_KEY = prevK;
  });
});
