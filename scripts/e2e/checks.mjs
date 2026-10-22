// The E2E checks, written against a small backend interface so they run the same way
// against supabase-js (scripts/hosted-e2e.mjs) and against PGlite in unit tests.
//
//   Client  = { select(table, { columns, limit, eq }) -> { data, error },
//               rpc(fn, args) -> { data, error } }
//   backend = { anon: Client,
//               admin: { createUser(label) -> { id, email, client },   // confirmed email user
//                        deleteUser(id), deleteCrew(id) } }            // idempotent, admin-only
//
// Results go to rec(name, pass, info). Writes register their undo with cleanup.add().
import crypto from 'node:crypto';

// Guest-mode public data: map/SGLs (places, incl. access labels in properties.access_type),
// stocking, counties and the stocking views. Hunting regs are bundled in the app, not the DB.
export const PUBLIC = ['places', 'counties', 'stocking_events', 'stocking_properties', 'place_stocking_county', 'stocking_county_totals'];
// Must be non-empty signed out (a guest map with no places is broken).
export const PUBLIC_NONEMPTY = ['places', 'counties', 'stocking_events'];
// Personal, social or internal: a signed-out client must get an error or zero rows.
export const PRIVATE = [
  'profiles', 'species_prefs', 'dogs', 'saved_places', 'hunt_log_entries', 'diary_entries',
  'groups', 'group_members', 'crew_invites', 'posts', 'post_locations', 'post_place_counts',
  'comments', 'likes', 'saves', 'user_blocks', 'reports', 'blocklist_terms', 'accepted_terms',
  'ingest_state', 'storage_deletion_queue',
];

const errInfo = (e) => (e ? `(${e.code ?? e.status ?? ''} ${e.message ?? ''})`.replace('( ', '(') : '');
// A transport failure is not an RLS denial: never count it as "denied" or "refused".
export const isTransportError = (e) => !!e && (/fetch failed|ECONNREFUSED|ENOTFOUND|network|timed? ?out/i.test(e.message ?? '') || e.status === 0);
const denied = (e) => !!e && !isTransportError(e);
const one = (data) => (Array.isArray(data) ? data[0] : data);

/** Signed-out reads: public tables readable (non-empty where required), private ones denied. */
export async function signedOutReads({ anon }, rec) {
  const ctx = {};
  for (const t of PUBLIC) {
    const r = await anon.select(t, { columns: '*', limit: 1 });
    const n = r.data?.length ?? 0;
    const pass = !r.error && (!PUBLIC_NONEMPTY.includes(t) || n > 0);
    rec(`signed-out read ${t}`, pass, r.error ? errInfo(r.error) : `(${n} row${n === 1 ? '' : 's'})`);
  }
  const p = await anon.select('places', { columns: 'id, type, name, properties', limit: 1000 });
  ctx.places = p.data ?? [];
  const sgl = ctx.places.filter((x) => x.type === 'game_land');
  rec('signed-out SGLs with access labels', !p.error && sgl.length > 0 && sgl.some((x) => x.properties?.access_type != null),
    p.error ? errInfo(p.error) : `(${sgl.length} SGLs in first ${ctx.places.length} places)`);
  for (const t of PRIVATE) {
    const r = await anon.select(t, { columns: '*', limit: 1 });
    const n = r.data?.length ?? 0;
    rec(`signed-out denied ${t}`, r.error ? denied(r.error) : n === 0, r.error ? `(error ${r.error.code ?? ''})`.replace(' )', ')') : `(${n} rows)`);
  }
  return ctx;
}

/** Signed-out writes must be refused. Calls RPCs that would write if allowed, so not in --read-only. */
export async function signedOutWritesRefused({ anon }, rec) {
  for (const [fn, args] of [['create_crew', { crew_name: 'e2e anon crew' }], ['delete_my_account', {}],
    ['upsert_hunt_log_entry', { p_client_id: crypto.randomUUID(), p_base_version: null, p_species: 'pheasant', p_caption: 'x', p_hunted_on: '2026-10-21', p_place_counts: [] }]]) {
    const r = await anon.rpc(fn, args);
    rec(`signed-out rpc ${fn} refused`, denied(r.error), errInfo(r.error));
  }
}

async function makeUser(admin, cleanup, label) {
  const u = await admin.createUser(label);
  cleanup.add(`user ${label}`, () => admin.deleteUser(u.id));
  return u;
}

/** Log a hunt as a disposable user and read it back. */
export async function huntLogRoundTrip({ admin }, rec, cleanup, { places = [] } = {}) {
  const u = await makeUser(admin, cleanup, 'hunter');
  rec('email user signed in', !!u.client);
  const cid = crypto.randomUUID(); const place = places.find((p) => p.type === 'game_land');
  const up = await u.client.rpc('upsert_hunt_log_entry', { p_client_id: cid, p_base_version: null, p_species: 'pheasant', p_caption: 'e2e hunt', p_hunted_on: '2026-10-21', p_place_counts: place ? [{ place_id: place.id, count: 1 }] : [] });
  rec('log hunt', !up.error, errInfo(up.error));
  const rb = await u.client.select('hunt_log_entries', { columns: 'client_id, species, caption', eq: { client_id: cid } });
  rec('read hunt back', !rb.error && rb.data?.length === 1 && rb.data[0].caption === 'e2e hunt', errInfo(rb.error));
  return u;
}

/** Crews: create, invite, join, visibility to member / non-member / signed-out, leave. */
export async function crews({ admin, anon }, rec, cleanup) {
  const a = await makeUser(admin, cleanup, 'crew-admin');
  const b = await makeUser(admin, cleanup, 'crew-member');
  const c = await makeUser(admin, cleanup, 'outsider');
  const cr = await a.client.rpc('create_crew', { crew_name: 'E2E crew' });
  const crew = one(cr.data);
  rec('create crew', !cr.error && !!crew, errInfo(cr.error));
  if (!crew) return;
  cleanup.add(`crew ${crew}`, () => admin.deleteCrew(crew)); // runs before the users are deleted (LIFO)
  const inv = await a.client.rpc('create_crew_invite', { gid: crew });
  const token = one(inv.data)?.token;
  rec('create crew invite', !inv.error && !!token, errInfo(inv.error));
  const j = await b.client.rpc('join_crew', { invite_token: token ?? '' });
  rec('join crew by invite', !j.error && one(j.data) === crew, errInfo(j.error));
  const bad = await c.client.rpc('join_crew', { invite_token: 'not-a-real-token' });
  rec('join crew with bad token refused', denied(bad.error), errInfo(bad.error));
  const seen = async (cl) => (await cl.select('groups', { columns: 'id', eq: { id: crew } })).data?.length ?? 0;
  rec('member sees crew', (await seen(b.client)) === 1);
  rec('non-member does not see crew', (await seen(c.client)) === 0);
  rec('signed-out does not see crew', (await seen(anon)) === 0);
  const mem = await c.client.select('group_members', { columns: 'user_id', eq: { group_id: crew } });
  rec('non-member does not see crew members', mem.error ? denied(mem.error) : (mem.data?.length ?? 0) === 0);
  const lb = await b.client.rpc('leave_crew', { gid: crew });
  rec('member leaves crew', !lb.error && one(lb.data) === 'left', errInfo(lb.error) || `(${one(lb.data)})`);
  const la = await a.client.rpc('leave_crew', { gid: crew });
  rec('last admin leaving deletes crew', !la.error && one(la.data) === 'deleted', errInfo(la.error) || `(${one(la.data)})`);
}

/** Runs everything. readOnly: signed-out reads only (no users, no writes, nothing to clean up). */
export async function runAll(backend, { readOnly = false, rec, cleanup }) {
  const ctx = await signedOutReads(backend, rec);
  if (readOnly) return;
  await signedOutWritesRefused(backend, rec);
  await huntLogRoundTrip(backend, rec, cleanup, ctx);
  await crews(backend, rec, cleanup);
}
