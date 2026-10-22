// E2E for guest mode against a Supabase stack, with supabase-js and the anon key.
//
//   node scripts/hosted-e2e.mjs [--read-only] [--allow-hosted]
//
// Target: SUPABASE_URL / SUPABASE_ANON_KEY env, else EXPO_PUBLIC_SUPABASE_* from app/.env.
// Refuses any non-local URL unless --allow-hosted is passed. Admin SQL (disposable users,
// cleanup) goes to DATABASE_URL (local only) or, with --allow-hosted, the Management API.
//
// Checks: signed-out reads (public tables readable, private denied); signed-out writes
// refused; hunt log round-trip as a disposable email user; crews. No anonymous sign-in
// (anon sign-ins are off on hosted; guests use the anon key with no session).
// --read-only does the signed-out reads only: no sign-ups, writes or cleanup.
// Everything created is tracked and removed in finally and on SIGINT. Logs are redacted.
import fs from 'node:fs'; import crypto from 'node:crypto'; import { createRequire } from 'node:module';
import { assertTargetAllowed, Cleanup, makeLogger, parseArgs } from './e2e/core.mjs';
import { runAll } from './e2e/checks.mjs';

const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

function loadEnv() {
  let file = {};
  const p = new URL('../app/.env', import.meta.url);
  if (fs.existsSync(p)) file = Object.fromEntries(fs.readFileSync(p, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
  return {
    url: process.env.SUPABASE_URL || file.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY || file.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    databaseUrl: process.env.DATABASE_URL,
  };
}

/** supabase-js client -> the Client interface in e2e/checks.mjs. */
export function wrapSupabase(sb) {
  return {
    async select(table, { columns = '*', limit, eq = {} } = {}) {
      let qb = sb.from(table).select(columns);
      for (const [k, v] of Object.entries(eq)) qb = qb.eq(k, v);
      if (limit) qb = qb.limit(limit);
      const { data, error } = await qb; return { data, error };
    },
    async rpc(fn, args) { const { data, error } = await sb.rpc(fn, args); return { data, error }; },
  };
}

async function adminSql({ databaseUrl, allowHosted }) {
  if (databaseUrl) {
    assertTargetAllowed(databaseUrl.replace(/^postgres(ql)?:/, 'http:'), { allowHosted, what: 'DATABASE_URL' });
    const pg = (await import('pg')).default; const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    return { query: async (sql) => (await client.query(sql)).rows, close: () => client.end() };
  }
  if (!allowHosted) throw new Error('set DATABASE_URL (local) for admin SQL, or pass --allow-hosted to use the Management API');
  const { q } = await import('./hosted-apply-migrations.mjs'); // needs SUPABASE_ACCESS_TOKEN
  return { query: q, close: () => {} };
}

function makeAdmin(sql, mk) {
  const tag = crypto.randomBytes(4).toString('hex');
  return {
    tag,
    async createUser(label) {
      const id = crypto.randomUUID(), email = `e2e-${label}-${tag}@example.invalid`, pw = crypto.randomBytes(18).toString('base64url');
      await sql.query(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
        values ('00000000-0000-0000-0000-000000000000',${lit(id)},'authenticated','authenticated',${lit(email)},extensions.crypt(${lit(pw)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
        insert into auth.identities (id,user_id,provider_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
        values (gen_random_uuid(),${lit(id)},${lit(id)},jsonb_build_object('sub',${lit(id)},'email',${lit(email)},'email_verified',true),'email',now(),now(),now());`);
      const sb = mk(); const si = await sb.auth.signInWithPassword({ email, password: pw });
      if (si.error) { await sql.query(`delete from auth.users where id = ${lit(id)}`); throw new Error(`sign-in failed: ${si.error.message}`); }
      return { id, email, client: wrapSupabase(sb) };
    },
    deleteUser: (id) => sql.query(`delete from auth.users where id = ${lit(id)}`),
    deleteCrew: (id) => sql.query(`delete from public.groups where id = ${lit(id)} and kind = 'crew'`),
    leftovers: async () => Number((await sql.query(`select count(*)::int n from auth.users where email like ${lit(`e2e-%-${tag}@example.invalid`)}`))[0].n),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log('usage: node scripts/hosted-e2e.mjs [--read-only] [--allow-hosted]'); return 0; }
  const env = loadEnv();
  const log = makeLogger([env.anonKey, env.databaseUrl, process.env.SUPABASE_ACCESS_TOKEN]);
  assertTargetAllowed(env.url, { allowHosted: args.allowHosted });
  if (!env.anonKey) throw new Error('anon key is not set');
  const { createClient } = createRequire(new URL('../app/package.json', import.meta.url))('@supabase/supabase-js');
  const mk = () => createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const results = []; const rec = (n, ok, info = '') => { results.push({ n, ok }); log(ok ? 'PASS' : 'FAIL', n, info); };
  const cleanup = new Cleanup();
  let sql = null, admin = null;
  const finish = async () => {
    const { failures } = await cleanup.run(log);
    if (admin) { try { log('cleanup: leftover e2e users =', await admin.leftovers()); } catch (e) { failures.push({ label: 'leftover count', error: e.message }); } }
    try { await sql?.close(); } catch {}
    sql = null;
    for (const f of failures) log('CLEANUP FAILURE', f.label, f.error);
    return failures;
  };
  process.once('SIGINT', async () => { log('SIGINT: cleaning up'); const f = await finish(); process.exit(f.length ? 3 : 130); });

  log(`target ${new URL(env.url).host}${args.readOnly ? ' (read-only)' : ''}`);
  let failures = [];
  try {
    if (!args.readOnly) { sql = await adminSql({ ...env, allowHosted: args.allowHosted }); admin = makeAdmin(sql, mk); }
    await runAll({ anon: wrapSupabase(mk()), admin }, { readOnly: args.readOnly, rec, cleanup });
  } catch (e) {
    rec('run aborted', false, e.message);
  } finally {
    failures = await finish();
  }
  log(`${results.filter((r) => r.ok).length}/${results.length} passed${failures.length ? `, ${failures.length} cleanup failure(s)` : ''}`);
  return results.every((r) => r.ok) && !failures.length ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code), (e) => { makeLogger([process.env.SUPABASE_ANON_KEY, process.env.DATABASE_URL, process.env.SUPABASE_ACCESS_TOKEN], console.error)('error:', e.message); process.exit(2); });
}
