import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

// Audit lows (Oct 31): migrations 20261031000000..500. Local PGlite only.
const u = (n) => `00000000-0000-4000-8000-0000000003${n}`;
const [alice, bob, carol, dave, erin, newA, newB, newC] = ['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'f2', 'f3'].map(u);

let db;
const run = (user, sql, params = []) => as(db, 'authenticated', user, (tx) => tx.query(sql, params));
const post = async (user, caption = 'x') =>
  (await run(user, `insert into public.posts (author_id, species, caption) values ($1, 'pheasant', $2) returning id`, [user, caption])).rows[0].id;
const makePublic = (id) => db.query(`update public.posts set public_after = now() - interval '1 minute' where id = $1`, [id]);
const sees = async (user, id) => (await run(user, `select id from public.posts where id = $1`, [id])).rows.length === 1;
const report = (user, col, id) =>
  run(user, `insert into public.reports (reporter_id, ${col}, reason) values ($1, $2, 'spam')`, [user, id]);

before(async () => {
  db = await createTestDb();
  for (const id of [alice, bob, carol, dave, erin, newA, newB, newC]) await createUser(db, id, `${id}@example.test`);
  await db.query(`update auth.users set created_at = now() - interval '30 days' where id = any($1)`, [[alice, bob, carol, dave, erin]]);
});

describe('is_blocked_between / contains_objectionable lockdown', () => {
  it('third parties cannot learn whether two others blocked each other', async () => {
    await run(alice, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [alice, bob]);
    const r = await run(carol, 'select public.is_blocked_between($1, $2) b', [alice, bob]);
    assert.equal(r.rows[0].b, false);
    assert.equal((await run(alice, 'select public.is_blocked_between($1, $2) b', [alice, bob])).rows[0].b, true);
  });

  it('blocking still hides posts in both directions (RLS callers unbroken)', async () => {
    const pa = await post(alice);
    const pb = await post(bob);
    await makePublic(pa);
    await makePublic(pb);
    assert.equal(await sees(bob, pa), false);
    assert.equal(await sees(alice, pb), false);
    assert.equal(await sees(carol, pa), true);
  });

  it('clients cannot call contains_objectionable, but the filter still rejects', async () => {
    await assert.rejects(run(carol, `select public.contains_objectionable('fuck')`), /permission denied/);
    await assert.rejects(post(carol, 'fuck this'), /objectionable content/);
  });
});

describe('post_place_counts lock and delay reset', () => {
  it('counts on a public post cannot be added, edited or deleted; pre-public they can', async () => {
    const id = await post(carol);
    await run(carol, 'insert into public.post_place_counts (post_id, flushed) values ($1, 2)', [id]);
    await run(carol, 'update public.post_place_counts set flushed = 3 where post_id = $1', [id]);
    await makePublic(id);
    await assert.rejects(run(carol, 'insert into public.post_place_counts (post_id, flushed) values ($1, 9)', [id]), /can no longer be edited/);
    await assert.rejects(run(carol, 'update public.post_place_counts set flushed = 9 where post_id = $1', [id]), /can no longer be edited/);
    await assert.rejects(run(carol, 'delete from public.post_place_counts where post_id = $1', [id]), /can no longer be edited/);
  });

  it('deleting a public post still cascades through its counts', async () => {
    const id = await post(carol);
    await run(carol, 'insert into public.post_place_counts (post_id, flushed) values ($1, 2)', [id]);
    await makePublic(id);
    await run(carol, 'delete from public.posts where id = $1', [id]);
    assert.equal((await db.query('select 1 from public.post_place_counts where post_id = $1', [id])).rows.length, 0);
  });

  it('editing content before publication restarts the delay', async () => {
    const id = await post(carol, 'first');
    // Pretend it was posted long ago and is about to go public.
    await db.query(`update public.posts set public_after = now() + interval '1 minute' where id = $1`, [id]);
    await run(carol, `update public.posts set caption = 'edited' where id = $1`, [id]);
    const { rows } = await db.query(`select public_after > now() + interval '11 hours' ok from public.posts where id = $1`, [id]);
    assert.equal(rows[0].ok, true);
  });

  it('editing child counts before publication restarts the delay', async () => {
    const id = await post(carol);
    await run(carol, 'insert into public.post_place_counts (post_id, flushed) values ($1, 2)', [id]);
    await db.query(`update public.posts set public_after = now() + interval '1 minute' where id = $1`, [id]);
    await run(carol, 'update public.post_place_counts set flushed = 5 where post_id = $1', [id]);
    const { rows } = await db.query(`select public_after > now() + interval '11 hours' ok from public.posts where id = $1`, [id]);
    assert.equal(rows[0].ok, true);
  });

  it('hiding the location of a public post is still allowed and does not move the delay', async () => {
    const id = await post(carol);
    await makePublic(id);
    await run(carol, `update public.posts set location_visibility = 'hidden' where id = $1`, [id]);
    assert.equal(await sees(erin, id), true);
  });
});

describe('report hardening', () => {
  it('three brand-new accounts cannot auto-hide a post; established ones can', async () => {
    const id = await post(alice, 'target');
    await makePublic(id);
    for (const r of [newA, newB, newC]) await report(r, 'post_id', id);
    assert.equal(await sees(erin, id), true, 'new accounts must not hide');
    await report(bob, 'post_id', id);
    await report(carol, 'post_id', id);
    assert.equal(await sees(erin, id), true);
    await report(dave, 'post_id', id);
    assert.equal(await sees(erin, id), false);
  });

  it('caps reports per user per day', async () => {
    const ids = [];
    for (let i = 0; i < 21; i++) ids.push(await post(alice, `p${i}`));
    for (const id of ids) await makePublic(id);
    for (let i = 0; i < 20 - 1; i++) await report(erin, 'post_id', ids[i]); // erin has 0 earlier reports
    await report(erin, 'post_id', ids[19]);
    await assert.rejects(report(erin, 'post_id', ids[20]), /report limit reached/);
  });

  it('groups can be reported, once per reporter', async () => {
    const g = (await db.query(`insert into public.groups (slug, name) values ('rep-me', 'Report me') returning id`)).rows[0].id;
    await report(bob, 'group_id', g);
    await assert.rejects(report(bob, 'group_id', g), /duplicate key/);
    await assert.rejects(
      run(bob, `insert into public.reports (reporter_id, group_id, post_id, reason) values ($1, $2, $3, 'spam')`, [bob, g, await post(alice)]),
      /reports_one_target/,
    );
  });

  it('filters usernames, display names and group names/descriptions', async () => {
    await assert.rejects(run(bob, `update public.profiles set username = 'big_fuck' where id = $1`, [bob]), /objectionable/);
    await assert.rejects(run(bob, `update public.profiles set display_name = 'Whore' where id = $1`, [bob]), /objectionable/);
    await run(bob, `update public.profiles set display_name = 'Bob the Setter' where id = $1`, [bob]);
    await assert.rejects(db.query(`insert into public.groups (slug, name) values ('bad-one', 'Fuck pheasants')`), /objectionable/);
    await assert.rejects(db.query(`insert into public.groups (slug, name, description) values ('bad-two', 'Fine', 'a slut group')`), /objectionable/);
  });
});

describe('age_attestations column grant', () => {
  it('clients cannot set attested_at; defaults apply', async () => {
    await assert.rejects(
      run(dave, `insert into public.age_attestations (user_id, attested_at) values ($1, '2000-01-01')`, [dave]),
      /permission denied/,
    );
    await run(dave, 'insert into public.age_attestations (user_id) values ($1)', [dave]);
    const { rows } = await db.query('select attested_at > now() - interval \'1 minute\' ok from public.age_attestations where user_id = $1', [dave]);
    assert.equal(rows[0].ok, true);
  });
});

describe('diary details size cap', () => {
  it('rejects details larger than 16 KB, accepts normal ones', async () => {
    const save = (client, details) =>
      run(erin, 'select * from public.upsert_diary_entry($1, $2, $3, $4, $5, $6, $7)', [
        client, null, 'pheasant', 'c', '2026-10-24', '[]', JSON.stringify(details),
      ]);
    await save('00000000-0000-4000-8000-000000000901', { notes: 'x'.repeat(2000) });
    await assert.rejects(save('00000000-0000-4000-8000-000000000902', { notes: 'x'.repeat(20000) }), /diary_details_size/);
  });
});

describe('plans unshared when the owner leaves a crew', () => {
  it('clears crew_id and stops crewmates reading it', async () => {
    const crew = (await run(alice, `select public.create_crew('Leave Test') id`)).rows[0].id;
    const token = (await run(alice, 'select * from public.create_crew_invite($1)', [crew])).rows[0].token;
    await run(bob, 'select public.join_crew($1)', [token]);
    await run(bob, `insert into public.plans (user_id, client_id, place_id, place_name, plan_date, crew_id)
      values (auth.uid(), '00000000-0000-4000-8000-000000000a01', 'sgl-211', 'SGL 211', '2026-11-07', $1)`, [crew]);
    assert.equal((await run(alice, 'select 1 from public.plans where user_id = $1', [bob])).rows.length, 1);
    await run(bob, 'select public.leave_crew($1)', [crew]);
    assert.equal((await run(alice, 'select 1 from public.plans where user_id = $1', [bob])).rows.length, 0);
    const { rows } = await run(bob, 'select crew_id from public.plans where user_id = $1', [bob]);
    assert.deepEqual(rows, [{ crew_id: null }]);
  });
});

describe('rollbacks', () => {
  it('every Oct 31 rollback applies cleanly in reverse order', async () => {
    const { readFileSync } = await import('node:fs');
    const fresh = await createTestDb();
    for (const n of ['500_diary_details_size', '400_age_attestation_grants', '300_plans_leave_crew', '200_report_hardening', '100_post_counts_lock_and_delay_reset', '000_definer_helper_lockdown']) {
      await fresh.exec(readFileSync(new URL(`../rollbacks/20261031000${n}.down.sql`, import.meta.url), 'utf8'));
    }
    const { rows } = await fresh.query(`select count(*)::int n from pg_trigger where tgname in
      ('post_place_counts_lock_after_public', 'reports_rate_limit', 'group_members_unshare_plans', 'profiles_reject_objectionable')`);
    assert.equal(rows[0].n, 0);
  });
});
