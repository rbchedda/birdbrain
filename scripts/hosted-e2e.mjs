// E2E against hosted Supabase with supabase-js (anon key from app/.env): anonymous sign-in,
// map layers (places paged like listPlaces, stocking view), log a hunt and read it back with a
// disposable email user (created via SQL), then clean up. Never prints secrets.
import fs from 'node:fs'; import crypto from 'node:crypto'; import { createRequire } from 'node:module';
import { q } from './hosted-apply-migrations.mjs';
const { createClient } = createRequire(new URL('../app/package.json', import.meta.url))('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync(new URL('../app/.env', import.meta.url), 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
const mk = () => createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const out = []; const rec = (n, ok, i = '') => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, i); };
const lit = (s) => `'${s.replaceAll("'", "''")}'`;
// 1. anonymous sign-in
const g = mk(); const an = await g.auth.signInAnonymously();
rec('anonymous sign-in', !an.error, an.error ? `(${an.error.status} ${an.error.message})` : '');
if (!an.error) { await g.rpc('delete_my_account'); }
// 2. map layers (anon)
const c = mk(); let places = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await c.from('places').select('id, type, name, county, species, centroid, acres').order('id').range(from, from + 999);
  if (error) { rec('places page', false, error.message); break; }
  places.push(...data); if (data.length < 1000) break;
}
const byType = places.reduce((m, p) => ((m[p.type] = (m[p.type] || 0) + 1), m), {});
rec('map layers populated', places.length === 618 && places.every((p) => p.centroid), JSON.stringify(byType));
const sv = await c.from('place_stocking_county').select('*', { count: 'exact', head: true });
rec('stocking county view', !sv.error && sv.count === 216, `(${sv.count})`);
const se = await c.from('stocking_events').select('county, release, ship_week').limit(3);
rec('stocking events readable', !se.error && se.data.length === 3);
// 3. log a hunt with a disposable confirmed user
const tag = crypto.randomBytes(4).toString('hex'), pw = crypto.randomBytes(18).toString('base64url'), id = crypto.randomUUID(), email = `e2e-${tag}@example.invalid`;
try {
  await q(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
    values ('00000000-0000-0000-0000-000000000000',${lit(id)},'authenticated','authenticated',${lit(email)},extensions.crypt(${lit(pw)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
    insert into auth.identities (id,user_id,provider_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values (gen_random_uuid(),${lit(id)},${lit(id)},jsonb_build_object('sub',${lit(id)},'email',${lit(email)},'email_verified',true),'email',now(),now(),now());`);
  const u = mk(); const si = await u.auth.signInWithPassword({ email, password: pw }); rec('email sign-in', !si.error, si.error?.message ?? '');
  const cid = crypto.randomUUID(); const place = places.find((p) => p.type === 'game_land');
  const up = await u.rpc('upsert_hunt_log_entry', { p_client_id: cid, p_base_version: null, p_species: 'pheasant', p_caption: 'e2e hunt', p_hunted_on: '2026-10-21', p_place_counts: [{ place_id: place.id, count: 1 }] });
  rec('log hunt', !up.error, up.error?.message ?? JSON.stringify(up.data));
  const rb = await u.from('hunt_log_entries').select('client_id, species, caption, hunted_on, place_counts, version').eq('client_id', cid);
  rec('read hunt back', !rb.error && rb.data.length === 1 && rb.data[0].caption === 'e2e hunt', JSON.stringify(rb.data?.[0] ?? rb.error));
  const del = await u.rpc('delete_my_account'); rec('delete test account', !del.error, del.error?.message ?? '');
} finally {
  await q(`delete from auth.users where id = ${lit(id)}`);
  const left = (await q(`select (select count(*) from auth.users where email like 'e2e-%@example.invalid' or is_anonymous) u, (select count(*) from public.hunt_log_entries) h`))[0];
  console.log('cleanup: test/anon users =', left.u, ', hunt_log_entries =', left.h);
}
console.log(`${out.filter(Boolean).length}/${out.length} passed`);
