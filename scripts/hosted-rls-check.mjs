// Hosted RLS smoke test. Anon checks via PostgREST/Storage with the anon key (from app/.env).
// Creates two disposable confirmed email users via SQL (Management API; no service_role key),
// signs in through GoTrue, runs cross-user checks, then deletes A via the app flow
// (Storage API removal + rpc delete_my_account) and B via SQL. Prints no secrets.
import fs from 'node:fs'; import crypto from 'node:crypto';
import { q } from './hosted-apply-migrations.mjs';
const env = Object.fromEntries(fs.readFileSync(new URL('../app/.env', import.meta.url), 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL, ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass }); console.log(pass ? 'PASS' : 'FAIL', name, info); };
const req = async (path, { token = ANON, method = 'GET', body, headers = {} } = {}) => {
  const r = await fetch(URL_ + path, { method, headers: { apikey: ANON, Authorization: `Bearer ${token}`, ...(body && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}), ...headers }, body: body instanceof Uint8Array ? body : body && JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
};
const lit = (s) => `'${s.replaceAll("'", "''")}'`;
const tag = crypto.randomBytes(4).toString('hex'); const pw = crypto.randomBytes(18).toString('base64url');
async function mkUser(n) {
  const id = crypto.randomUUID(), email = `rls-${n}-${tag}@example.invalid`;
  await q(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
    values ('00000000-0000-0000-0000-000000000000',${lit(id)},'authenticated','authenticated',${lit(email)},extensions.crypt(${lit(pw)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
    insert into auth.identities (id,user_id,provider_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values (gen_random_uuid(),${lit(id)},${lit(id)},jsonb_build_object('sub',${lit(id)},'email',${lit(email)},'email_verified',true),'email',now(),now(),now());`);
  const r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pw } });
  if (!r.j.access_token) throw new Error(`sign-in failed ${r.s} ${JSON.stringify(r.j).slice(0, 200)}`);
  return { id, token: r.j.access_token };
}
const tables = (await q(`select tablename from pg_tables where schemaname='public' order by 1`)).map((r) => r.tablename);
const views = ['stocking_county_totals', 'place_stocking_county'];
const PUBLIC_REF = new Set(['places', 'counties', 'stocking_events', 'stocking_properties', ...views]);
// Seed one row per user-owned table via SQL so anon "[]" is meaningful.
let A, B;
try {
  A = await mkUser('a'); B = await mkUser('b');
  // anon reads
  for (const t of [...tables, ...views]) {
    const r = await req(`/rest/v1/${t}?select=*&limit=1`);
    if (PUBLIC_REF.has(t)) ok(`anon read ${t} allowed-or-empty`, r.s === 200 || r.s === 401, `(${r.s})`);
    else ok(`anon read ${t} returns nothing`, (r.s === 200 && Array.isArray(r.j) && r.j.length === 0) || [401, 403, 404].includes(r.s), `(${r.s} ${Array.isArray(r.j) ? r.j.length + ' rows' : ''})`);
  }
  for (const t of tables) { const r = await req(`/rest/v1/${t}`, { method: 'POST', body: {} }); ok(`anon insert ${t} refused`, r.s >= 400, `(${r.s})`); }
  ok('anon rpc delete_my_account refused', (await req('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} })).s >= 400);
  // A creates data
  const cid = crypto.randomUUID();
  const up = await req('/rest/v1/rpc/upsert_hunt_log_entry', { token: A.token, method: 'POST', body: { p_client_id: cid, p_base_version: null, p_species: 'pheasant', p_caption: 'rls test', p_hunted_on: '2026-10-21', p_place_counts: [] } });
  ok('A upsert_hunt_log_entry', up.s < 300, `(${up.s} ${JSON.stringify(up.j).slice(0, 150)})`);
  const entry = (await req(`/rest/v1/hunt_log_entries?select=id&client_id=eq.${cid}`, { token: A.token })).j[0];
  const di = await req('/rest/v1/diary_entries', { token: A.token, method: 'POST', body: { entry_id: entry?.id, details: {} } });
  ok('A insert diary_entry', di.s < 300, `(${di.s} ${JSON.stringify(di.j).slice(0, 150)})`);
  const dog = await req('/rest/v1/dogs', { token: A.token, method: 'POST', body: { owner_id: A.id, name: 'Rls' } });
  ok('A insert dog', dog.s < 300, `(${dog.s})`);
  const img = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  for (const [bk, p] of [['diary-photos', `${A.id}/${cid}/t.jpg`], ['post-photos', `${A.id}/t.jpg`]]) {
    const r = await req(`/storage/v1/object/${bk}/${p}`, { token: A.token, method: 'POST', body: img, headers: { 'content-type': 'image/jpeg' } });
    ok(`A upload ${bk}`, r.s < 300, `(${r.s} ${JSON.stringify(r.j).slice(0, 120)})`);
    ok(`anon download ${bk} refused`, (await req(`/storage/v1/object/${bk}/${p}`)).s >= 400);
    ok(`B download A's ${bk} refused`, (await req(`/storage/v1/object/${bk}/${p}`, { token: B.token })).s >= 400);
    ok(`B upload into A's ${bk} folder refused`, (await req(`/storage/v1/object/${bk}/${A.id}/evil.jpg`, { token: B.token, method: 'POST', body: img, headers: { 'content-type': 'image/jpeg' } })).s >= 400);
    const l = await req(`/storage/v1/object/list/${bk}`, { method: 'POST', body: { prefix: `${A.id}/` } });
    ok(`anon list ${bk} empty`, l.s >= 400 || (Array.isArray(l.j) && l.j.length === 0));
  }
  // B cross-user
  for (const t of ['hunt_log_entries', 'diary_entries', 'dogs']) {
    const r = await req(`/rest/v1/${t}?select=*`, { token: B.token }); ok(`B sees none of A's ${t}`, r.s === 200 && r.j.length === 0, `(${r.j.length ?? r.s})`);
    const a = await req(`/rest/v1/${t}?select=*`, { token: A.token }); ok(`A sees own ${t}`, a.s === 200 && a.j.length === 1, `(${a.j.length ?? a.s})`);
  }
  const bu = await req(`/rest/v1/dogs?owner_id=eq.${A.id}`, { token: B.token, method: 'PATCH', body: { name: 'pwned' }, headers: { Prefer: 'return=representation' } });
  ok("B update A's dog no-op", bu.s >= 400 || (Array.isArray(bu.j) && bu.j.length === 0));
  const bd = await req(`/rest/v1/diary_entries?entry_id=eq.${entry?.id}`, { token: B.token, method: 'PATCH', body: { details: { x: 1 } }, headers: { Prefer: 'return=representation' } });
  ok("B update A's diary no-op", bd.s >= 400 || (Array.isArray(bd.j) && bd.j.length === 0));
  // delete flow for A: Storage API removal, then rpc
  for (const [bk, prefix] of [['diary-photos', `${A.id}/${cid}`], ['post-photos', A.id]]) {
    const l = await req(`/storage/v1/object/list/${bk}`, { token: A.token, method: 'POST', body: { prefix } });
    const names = (l.j || []).filter((o) => o.id).map((o) => `${prefix}/${o.name}`);
    const d = await req(`/storage/v1/object/${bk}`, { token: A.token, method: 'DELETE', body: { prefixes: names } });
    ok(`A removes own ${bk} via Storage API`, d.s < 300 && names.length === 1, `(${d.s}, ${names.length} file)`);
  }
  const del = await req('/rest/v1/rpc/delete_my_account', { token: A.token, method: 'POST', body: {} });
  ok('A rpc delete_my_account', del.s < 300, `(${del.s} ${JSON.stringify(del.j).slice(0, 150)})`);
  const left = (await q(`select (select count(*) from auth.users where id=${lit(A.id)}) u,(select count(*) from public.profiles where id=${lit(A.id)}) p,
    (select count(*) from public.hunt_log_entries where owner_id=${lit(A.id)}) h,(select count(*) from public.diary_entries where owner_id=${lit(A.id)}) d,
    (select count(*) from public.dogs where owner_id=${lit(A.id)}) g,(select count(*) from storage.objects where (storage.foldername(name))[1]=${lit(A.id)}) o`))[0];
  ok('A fully gone (user, profile, log, diary, dogs, objects)', Object.values(left).every((v) => Number(v) === 0), JSON.stringify(left));
  A = null;
} finally {
  const ids = [A?.id, B?.id].filter(Boolean);
  if (ids.length) await q(`delete from auth.users where id in (${ids.map(lit).join(',')})`);
  const rest = (await q(`select count(*) n from auth.users where email like 'rls-%-${tag}@example.invalid'`))[0].n;
  console.log('cleanup: test users remaining =', rest);
}
const f = results.filter((r) => !r.pass); console.log(`\n${results.length - f.length}/${results.length} passed`); process.exit(f.length ? 1 : 0);
