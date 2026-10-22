import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';
import { assertTargetAllowed, Cleanup, isLocalUrl, makeLogger, parseArgs, redact } from '../../scripts/e2e/core.mjs';
import { PRIVATE, runAll, signedOutReads } from '../../scripts/e2e/checks.mjs';

/*
 * scripts/hosted-e2e.mjs runs its checks through a small Client interface. Here the same
 * checks run against PGlite (anon/authenticated roles + RLS), never against a hosted project.
 */
const ident = (s) => { if (!/^[a-z_]+$/.test(s)) throw new Error(`bad identifier ${s}`); return s; };
const val = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

function pgliteClient(db, role, uid) {
  const run = (sql, params) => as(db, role, uid, (tx) => tx.query(sql, params))
    .then((r) => ({ rows: r.rows }), (e) => ({ error: { message: e.message, code: e.code } }));
  return {
    async select(table, { columns = '*', limit, eq = {} } = {}) {
      const keys = Object.keys(eq);
      const where = keys.length ? ` where ${keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(' and ')}` : '';
      const r = await run(`select ${columns} from public.${ident(table)}${where}${limit ? ` limit ${Number(limit)}` : ''}`, keys.map((k) => eq[k]));
      return r.error ? { data: null, error: r.error } : { data: r.rows, error: null };
    },
    async rpc(fn, args = {}) {
      const keys = Object.keys(args);
      const r = await run(`select * from public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`, keys.map((k) => val(args[k])));
      if (r.error) return { data: null, error: r.error };
      const scalar = r.rows.length === 1 && Object.keys(r.rows[0]).length === 1 && fn in r.rows[0];
      return { data: scalar ? r.rows[0][fn] : r.rows, error: null };
    },
  };
}

let n = 0;
function pgliteBackend(db, { failDeleteOnce = false } = {}) {
  let failed = false;
  return {
    anon: pgliteClient(db, 'anon', null),
    admin: {
      async createUser(label) {
        const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
        await createUser(db, id, `e2e-${label}-${n}@example.invalid`);
        return { id, client: pgliteClient(db, 'authenticated', id) };
      },
      async deleteUser(id) {
        if (failDeleteOnce && !failed) { failed = true; throw new Error('simulated delete failure'); }
        await db.query('delete from auth.users where id = $1', [id]);
      },
      deleteCrew: (id) => db.query(`delete from public.groups where id = $1 and kind = 'crew'`, [id]),
    },
  };
}

const collect = () => { const r = []; return { r, rec: (name, pass, info) => r.push({ name, pass, info }) }; };
const count = async (db, sql) => Number((await db.query(sql)).rows[0].n);
const e2eUsers = (db) => count(db, `select count(*) n from auth.users where email like 'e2e-%'`);

let db;
before(async () => {
  db = await createTestDb();
  const poly = `extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromtext('POLYGON((-77 40,-76.9 40,-76.9 40.1,-77 40.1,-77 40))'), 4326))`;
  const owner = '00000000-0000-4000-8000-0000000000aa';
  await createUser(db, owner, 'owner@example.test');
  await db.exec(`
    insert into public.counties (geom, name, fips, source) values (${poly}, 'Centre', '42027', 'test');
    insert into public.places (geom, source_id, source, name, type, properties)
      values (${poly}, 'sgl-176', 'test', 'SGL 176', 'game_land', '{"access_type":"public"}'),
             (${poly}, 'stock-1', 'test', 'Stocked field', 'stocking', '{}');
    insert into public.stocking_events (ship_week, window_start, window_end, cocks, hens, source, release_label, release, county, region, season, junior)
      values ('W1', '2026-10-20', '2026-10-26', 10, 5, 'test', 'PRE SEASON', 'pre_season', 'Centre', 'Northcentral', '2026-27', false);
    insert into public.stocking_properties (county, season, region, name, source) values ('Centre', '2026-27', 'Northcentral', 'SGL 176', 'test');
    insert into public.blocklist_terms (term) values ('slur');
    insert into public.dogs (owner_id, name) values ('${owner}', 'Rosie');
    insert into public.groups (name, slug) values ('Pheasant', 'pheasant-e2e');
  `);
});

describe('e2e checks against PGlite', () => {
  it('full run passes and cleans up every user and crew it created', async () => {
    const { r, rec } = collect(); const cleanup = new Cleanup();
    const crewsBefore = await count(db, `select count(*) n from public.groups where kind = 'crew'`);
    try { await runAll(pgliteBackend(db), { rec, cleanup }); } finally { assert.deepEqual((await cleanup.run()).failures, []); }
    assert.deepEqual(r.filter((x) => !x.pass), []);
    for (const name of ['signed-out read places', 'signed-out denied dogs', 'signed-out rpc create_crew refused', 'log hunt', 'read hunt back',
      'create crew', 'join crew by invite', 'non-member does not see crew', 'signed-out does not see crew', 'last admin leaving deletes crew']) {
      assert.ok(r.some((x) => x.name === name && x.pass), name);
    }
    assert.ok(!r.some((x) => /anonymous sign-in/i.test(x.name)), 'no anonymous sign-in step');
    assert.equal(await e2eUsers(db), 0);
    assert.equal(await count(db, `select count(*) n from public.groups where kind = 'crew'`), crewsBefore);
    assert.equal(await count(db, `select count(*) n from public.hunt_log_entries`), 0);
  });

  it('--read-only touches no admin API and registers nothing to clean up', async () => {
    const { r, rec } = collect(); const cleanup = new Cleanup();
    const admin = new Proxy({}, { get: () => { throw new Error('admin used in read-only'); } });
    await runAll({ anon: pgliteBackend(db).anon, admin }, { readOnly: true, rec, cleanup });
    assert.deepEqual(cleanup.pending, []);
    assert.ok(r.length > PRIVATE.length && r.every((x) => x.pass) && r.every((x) => x.name.startsWith('signed-out')));
    assert.ok(!r.some((x) => /rpc/.test(x.name)), 'no RPC calls in read-only');
  });

  it('flags a private table that leaks to signed-out reads', async () => {
    await db.exec(`create policy e2e_leak on public.dogs for select to anon using (true); grant select on public.dogs to anon;`);
    try {
      const { r, rec } = collect();
      await signedOutReads(pgliteBackend(db), rec);
      assert.equal(r.find((x) => x.name === 'signed-out denied dogs').pass, false);
    } finally { await db.exec('drop policy e2e_leak on public.dogs'); }
  });

  it('cleanup keeps going past a failed step, reports it, and is idempotent', async () => {
    const { rec } = collect(); const cleanup = new Cleanup();
    await runAll(pgliteBackend(db, { failDeleteOnce: true }), { rec, cleanup });
    const first = await cleanup.run();
    assert.equal(first.failures.length, 1);
    assert.match(first.failures[0].error, /simulated/);
    assert.ok(first.done >= 3);
    assert.equal(await e2eUsers(db), 1, 'only the failed user is left');
    assert.deepEqual(await cleanup.run(), { done: 0, failures: [] }, 'second run is a no-op');
    await db.query(`delete from auth.users where email like 'e2e-%'`);
  });
});

describe('transport errors', () => {
  it('a network failure is never counted as an RLS denial', async () => {
    const down = { select: async () => ({ data: null, error: { message: 'TypeError: fetch failed' } }), rpc: async () => ({ data: null, error: { message: 'TypeError: fetch failed' } }) };
    const { r, rec } = collect();
    await signedOutReads({ anon: down }, rec);
    assert.ok(r.length > 0 && r.every((x) => !x.pass));
  });
});

describe('Cleanup', () => {
  it('runs LIFO, once, and shares one pass between finally and SIGINT', async () => {
    const order = []; const c = new Cleanup();
    c.add('a', async () => order.push('a'));
    c.add('b', async () => { await new Promise((r) => setTimeout(r, 5)); order.push('b'); });
    const [x, y] = await Promise.all([c.run(), c.run()]);
    assert.deepEqual(order, ['b', 'a']);
    assert.equal(x, y);
    assert.equal((await c.run()).done, 0);
  });
});

describe('target guard', () => {
  it('allows only local URLs by default', () => {
    for (const u of ['http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321', 'http://api.localhost']) {
      assert.ok(isLocalUrl(u), u); assert.doesNotThrow(() => assertTargetAllowed(u));
    }
    for (const u of ['https://ipvcrygkulrwopgtdkwd.supabase.co', 'https://example.com', 'http://127.0.0.1.evil.com', 'http://localhost.evil.com']) {
      assert.equal(isLocalUrl(u), false, u); assert.throws(() => assertTargetAllowed(u), /refusing.*--allow-hosted/);
    }
    assert.doesNotThrow(() => assertTargetAllowed('https://example.com', { allowHosted: true }));
    assert.throws(() => assertTargetAllowed(undefined, { allowHosted: true }), /not set/);
    assert.throws(() => assertTargetAllowed('nope', { allowHosted: true }), /not a valid URL/);
  });

  it('the script refuses a hosted URL without the flag, before any network call, and prints no key', () => {
    const key = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{"role":"anon"}').toString('base64url')}.sig_PLANTED_1234`;
    const p = spawnSync(process.execPath, ['scripts/hosted-e2e.mjs', '--read-only'], {
      env: { PATH: process.env.PATH, SUPABASE_URL: 'https://ipvcrygkulrwopgtdkwd.supabase.co', SUPABASE_ANON_KEY: key }, encoding: 'utf8',
    });
    assert.equal(p.status, 2);
    assert.match(p.stderr, /refusing to run against non-local Supabase URL/);
    assert.ok(!(p.stdout + p.stderr).includes(key));
    assert.doesNotMatch(p.stdout, /PASS|FAIL/);
  });

  it('parses flags and rejects unknown ones', () => {
    assert.deepEqual(parseArgs(['--read-only']), { readOnly: true, allowHosted: false, help: false });
    assert.throws(() => parseArgs(['--allow-hostd']), /unknown/);
  });
});

describe('redaction', () => {
  it('redacts given secrets and key/token shapes', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abcdefSIG';
    const out = redact(`k=${jwt} s=sb_publishable_abcdefgh123 t=sbp_0123456789abcdefghijkl db=postgres://postgres:hunter2@127.0.0.1:54322/postgres x=mysecretvalue`, ['mysecretvalue']);
    for (const s of [jwt, 'sb_publishable_abcdefgh123', 'sbp_0123456789abcdefghijkl', 'hunter2', 'mysecretvalue']) assert.ok(!out.includes(s), s);
    assert.match(out, /postgres:\/\/postgres:\[REDACTED\]@127/);
    const lines = []; makeLogger(['topsecret'], (l) => lines.push(l))('PASS', { token: 'topsecret' });
    assert.equal(lines[0], 'PASS {"token":"[REDACTED]"}');
  });
});
