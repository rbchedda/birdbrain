import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const id = (prefix, n) => `00000000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, '0')}`;
const alice = id('a', 1);
const bob = id('b', 1);
const carol = id('c', 1);
const eve = id('e', 1);
const guest = id('f', 1);

let db;
const q = (user, sql, params = []) => as(db, 'authenticated', user, (tx) => tx.query(sql, params));
const rows = async (user, sql, params) => (await q(user, sql, params)).rows;
const newCrew = async (admin, name = 'Crew') => (await rows(admin, `select public.create_crew($1) id`, [name]))[0].id;
const invite = async (admin, crew) => (await rows(admin, `select * from public.create_crew_invite($1)`, [crew]))[0];
const join = async (user, token) => (await rows(user, `select public.join_crew($1) id`, [token]))[0].id;
const members = (crew) =>
  db.query(`select user_id, role from public.group_members where group_id = $1 order by joined_at, user_id`, [crew]).then((r) => r.rows);

before(async () => {
  db = await createTestDb();
  for (const [u, e] of [[alice, 'a'], [bob, 'b'], [carol, 'c'], [eve, 'e'], [guest, 'g']]) await createUser(db, u, `${e}@example.test`);
  await db.query('update auth.users set is_anonymous = true where id = $1', [guest]);
});

describe('guests', () => {
  it('refuses create_crew for an anonymous user (auth.users flag)', async () => {
    await assert.rejects(newCrew(guest), /create an account/);
  });

  it('refuses via the is_anonymous JWT claim too', async () => {
    const claimGuest = id('f', 2);
    await createUser(db, claimGuest, 'claim@example.test');
    const run = (sql, params) =>
      db.transaction(async (tx) => {
        await tx.query('set local role authenticated');
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: claimGuest, role: 'authenticated', is_anonymous: true }),
        ]);
        return tx.query(sql, params);
      });
    await assert.rejects(run(`select public.create_crew('x')`), /create an account/);
    const crew = await newCrew(alice);
    const { token } = await invite(alice, crew);
    await assert.rejects(run('select public.join_crew($1)', [token]), /create an account to join/);
  });

  it('refuses join_crew for an anonymous user', async () => {
    const crew = await newCrew(alice);
    const { token } = await invite(alice, crew);
    await assert.rejects(join(guest, token), /create an account to join/);
    assert.equal((await members(crew)).length, 1);
  });
});

describe('caps', () => {
  it('caps a crew at 25 members', async () => {
    const crew = await newCrew(alice);
    const { token } = await invite(alice, crew);
    for (let i = 1; i <= 24; i++) {
      const u = id('d', i);
      await createUser(db, u, `d${i}@example.test`);
      await join(u, token);
    }
    assert.equal((await members(crew)).length, 25);
    await assert.rejects(join(bob, token), /crew is full/);
    // Already a member: still a no-op, not "full".
    assert.equal(await join(id('d', 3), token), crew);
    // A seat frees up when someone leaves.
    await rows(id('d', 1), 'select public.leave_crew($1)', [crew]);
    assert.equal(await join(bob, token), crew);
  });

  it('enforces the cap on direct inserts too (trigger, not just the RPC)', async () => {
    const full = (await db.query(`select group_id from public.group_members group by group_id having count(*) = 25`)).rows[0].group_id;
    await assert.rejects(db.query(`insert into public.group_members (group_id, user_id) values ($1, $2)`, [full, eve]), /crew is full/);
  });

  it('ignores the client ttl: invites always expire in 7 days', async () => {
    const crew = await newCrew(alice);
    for (const ttl of [1, 720, null]) {
      const r = (await rows(alice, `select round(extract(epoch from expires_at - now()) / 86400)::int as d from public.create_crew_invite($1, $2)`, [crew, ttl]))[0];
      assert.equal(r.d, 7, `ttl ${ttl}`);
    }
    await assert.rejects(
      db.query(`insert into public.crew_invites (group_id, token_hash, expires_at) values ($1, 'x', now() + interval '8 days')`, [crew]),
      /crew_invites_max_7_days/,
    );
  });

  it('allows at most 10 active invites; revoked and expired ones free slots', async () => {
    const crew = await newCrew(carol);
    for (let i = 0; i < 10; i++) await invite(carol, crew);
    await assert.rejects(invite(carol, crew), /too many active invites/);
    await rows(carol, `update public.crew_invites set revoked_at = now() where id = (select id from public.crew_invites where group_id = $1 limit 1)`, [crew]);
    await invite(carol, crew);
    await assert.rejects(invite(carol, crew), /too many active invites/);
    await db.query(
      `update public.crew_invites set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
        where id = (select id from public.crew_invites where group_id = $1 and revoked_at is null limit 1)`,
      [crew],
    );
    await invite(carol, crew);
  });
});

describe('leaving', () => {
  it('promotes the longest-standing member when the last admin leaves', async () => {
    const crew = await newCrew(alice);
    const { token } = await invite(alice, crew);
    await join(carol, token);
    await join(bob, token);
    // Same joined_at for both: lowest user_id wins the tiebreak (bob < carol).
    await db.query(`update public.group_members set joined_at = '2026-01-01' where group_id = $1 and user_id <> $2`, [crew, alice]);
    assert.equal((await rows(alice, 'select public.leave_crew($1) r', [crew]))[0].r, 'promoted');
    assert.deepEqual(await members(crew), [
      { user_id: bob, role: 'admin' },
      { user_id: carol, role: 'member' },
    ]);
  });

  it('earliest joined_at wins over user_id', async () => {
    const crew = await newCrew(alice);
    const { token } = await invite(alice, crew);
    await join(bob, token);
    await join(carol, token);
    await db.query(`update public.group_members set joined_at = '2025-01-01' where group_id = $1 and user_id = $2`, [crew, carol]);
    await rows(alice, 'select public.leave_crew($1)', [crew]);
    assert.equal((await members(crew)).find((m) => m.role === 'admin').user_id, carol);
  });

  it('a plain member leaving changes nobody else', async () => {
    const crew = await newCrew(alice);
    await join(bob, (await invite(alice, crew)).token);
    assert.equal((await rows(bob, 'select public.leave_crew($1) r', [crew]))[0].r, 'left');
    assert.deepEqual(await members(crew), [{ user_id: alice, role: 'admin' }]);
  });

  it('deletes the crew (and its invites) when the last member leaves', async () => {
    const crew = await newCrew(alice);
    await invite(alice, crew);
    assert.equal((await rows(alice, 'select public.leave_crew($1) r', [crew]))[0].r, 'deleted');
    assert.equal((await db.query('select 1 from public.groups where id = $1', [crew])).rows.length, 0);
    assert.equal((await db.query('select 1 from public.crew_invites where group_id = $1', [crew])).rows.length, 0);
  });

  it("can't be bypassed by deleting your own membership row directly", async () => {
    const crew = await newCrew(alice);
    await join(bob, (await invite(alice, crew)).token);
    await q(alice, 'delete from public.group_members where group_id = $1 and user_id = $2', [crew, alice]);
    assert.deepEqual(await members(crew), [{ user_id: bob, role: 'admin' }]);
    await q(bob, 'delete from public.group_members where group_id = $1 and user_id = $2', [crew, bob]);
    assert.equal((await db.query('select 1 from public.groups where id = $1', [crew])).rows.length, 0);
  });

  it('refuses demoting the last admin', async () => {
    const crew = await newCrew(alice);
    await assert.rejects(q(alice, `update public.group_members set role = 'member' where group_id = $1`, [crew]), /needs an admin/);
  });

  it('an admin deleting the whole crew still works', async () => {
    const crew = await newCrew(alice);
    await join(bob, (await invite(alice, crew)).token);
    await q(alice, 'delete from public.groups where id = $1', [crew]);
    assert.equal((await db.query('select 1 from public.group_members where group_id = $1', [crew])).rows.length, 0);
  });

  it('species groups are unaffected (no promotion, no deletion)', async () => {
    const g = (await db.query(`select id from public.groups where kind = 'species' limit 1`)).rows[0].id;
    await q(eve, 'insert into public.group_members (group_id, user_id) values ($1, $2)', [g, eve]);
    await rows(eve, 'select public.leave_crew($1)', [g]);
    assert.equal((await db.query('select 1 from public.groups where id = $1', [g])).rows.length, 1);
  });
});

describe('crew posts never touch public counts', () => {
  let crew;
  let place;

  // Everything a community (non-crew) surface can show, as seen by `user`.
  const publicMetrics = async (user) =>
    (
      await rows(
        user,
        `select (select count(*) from public.posts where not crew_only)::int as posts,
                (select count(*) from public.likes l join public.posts p on p.id = l.post_id where not p.crew_only)::int as likes,
                (select count(*) from public.comments c join public.posts p on p.id = c.post_id where not p.crew_only)::int as comments,
                (select coalesce(sum((counts->>'harvested')::int), 0) from public.posts where not crew_only)::int as harvested,
                (select count(*) from public.post_place_counts c join public.posts p on p.id = c.post_id where not p.crew_only)::int as place_rows,
                (select count(*) from public.posts where not crew_only and author_id = $1)::int as alice_profile`,
        [alice],
      )
    )[0];
  const age = (pid) => db.query(`update public.posts set public_after = now() - interval '1 hour' where id = $1`, [pid]);

  before(async () => {
    crew = await newCrew(alice, 'Counts');
    await join(bob, (await invite(alice, crew)).token);
    place = (await db.query(`insert into public.places (name, type, geom, source, source_id) values ('Game Lands 1', 'game_land', 'SRID=4326;POINT(-77 40)', 'test', 'gl1') returning id`)).rows[0]?.id;
    const pub = (await rows(alice, `insert into public.posts (author_id, species) values ($1, 'pheasant') returning id`, [alice]))[0].id;
    await q(alice, `insert into public.post_place_counts (post_id, place_id, harvested) values ($1, $2, 1)`, [pub, place]);
    await age(pub);
    await q(bob, 'insert into public.likes (post_id, user_id) values ($1, $2)', [pub, bob]);
  });

  it('a crew post with counts, likes and comments leaves every public metric unchanged, for members and outsiders', async () => {
    const before = { eve: await publicMetrics(eve), bob: await publicMetrics(bob), alice: await publicMetrics(alice) };
    const pid = (await rows(alice, `insert into public.posts (author_id, species, group_id) values ($1, 'pheasant', $2) returning id`, [alice, crew]))[0].id;
    await q(alice, `insert into public.post_place_counts (post_id, place_id, harvested, flushed) values ($1, $2, 3, 9)`, [pid, place]);
    await age(pid);
    await q(bob, 'insert into public.likes (post_id, user_id) values ($1, $2)', [pid, bob]);
    await q(bob, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'nice')`, [pid, bob]);
    await db.query(`update public.comments set public_after = now() - interval '1 hour' where post_id = $1`, [pid]).catch(() => {});
    assert.deepEqual(await publicMetrics(eve), before.eve);
    assert.deepEqual(await publicMetrics(bob), before.bob);
    assert.deepEqual(await publicMetrics(alice), before.alice);
    // Members do see it, but only flagged crew_only, so community lists drop it.
    assert.deepEqual(await rows(bob, 'select crew_only from public.posts where id = $1', [pid]), [{ crew_only: true }]);
    // Outsiders can't see it, its likes, its comments or its counts at all.
    assert.equal((await rows(eve, 'select 1 from public.posts where id = $1', [pid])).length, 0);
    assert.equal((await rows(eve, 'select 1 from public.likes where post_id = $1', [pid])).length, 0);
    assert.equal((await rows(eve, 'select 1 from public.comments where post_id = $1', [pid])).length, 0);
    assert.equal((await rows(eve, 'select 1 from public.post_place_counts where post_id = $1', [pid])).length, 0);
  });

  it("anon can't read posts, likes, comments or place counts", async () => {
    for (const t of ['posts', 'likes', 'comments', 'post_place_counts']) {
      const r = await as(db, 'anon', null, (tx) => tx.query(`select count(*)::int n from public.${t}`)).catch(() => ({ rows: [{ n: 0 }] }));
      assert.equal(r.rows[0].n, 0, t);
    }
  });

  it("crew_only is derived: clients can't clear it, and it's backfilled/kept on group changes", async () => {
    const pid = (await db.query(`select id from public.posts where group_id = $1 limit 1`, [crew])).rows[0].id;
    await assert.rejects(q(alice, 'update public.posts set crew_only = false where id = $1', [pid]), /permission denied/);
    await db.query('update public.posts set crew_only = false where id = $1', [pid]);
    assert.equal((await db.query('select crew_only from public.posts where id = $1', [pid])).rows[0].crew_only, true);
  });

  it('no view or function in public aggregates posts without the crew filter (catalog audit)', async () => {
    const postTables = /public\.(posts|likes|comments|post_place_counts)\b|\bfrom posts\b/;
    const views = (await db.query(`select viewname, definition from pg_views where schemaname = 'public'`)).rows;
    for (const v of views) assert.doesNotMatch(v.definition, postTables, `view ${v.viewname} reads posts`);
    const fns = (
      await db.query(
        `select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosrc ~* '(count|sum|avg)\\s*\\(' and p.prosrc ~ 'public\\.(posts|likes|comments|post_place_counts)'`,
      )
    ).rows.map((r) => r.proname);
    // sync_post_counts sums one post's own rows into that post (per-post, RLS-gated);
    // hide_reported_content counts distinct reporters on one post, not posts.
    const allowed = new Set(['sync_post_counts', 'hide_reported_content']);
    for (const f of fns) assert.ok(allowed.has(f), `function ${f} aggregates post data; make it exclude crew_only posts`);
  });
});
