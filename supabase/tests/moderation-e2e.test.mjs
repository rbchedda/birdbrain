import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const u = (n) => `00000000-0000-4000-8000-0000000000${n}`;
const [alice, bob, carol, dave, erin] = ['a1', 'b1', 'c1', 'd1', 'e1'].map(u);

let db;
const run = (user, sql, params = []) => as(db, 'authenticated', user, (tx) => tx.query(sql, params));
const post = async (user, caption) =>
  (await run(user, `insert into public.posts (author_id, species, caption) values ($1, 'pheasant', $2) returning id`, [user, caption])).rows[0].id;
const comment = async (user, postId, body) =>
  (await run(user, `insert into public.comments (post_id, author_id, body) values ($1, $2, $3) returning id`, [postId, user, body])).rows[0].id;
const age = async (id) => {
  await db.query(`update public.posts set public_after = now() - interval '1 minute' where id = $1`, [id]);
  await db.query(`update public.comments set public_after = now() - interval '1 minute' where post_id = $1`, [id]);
};
const sees = async (user, table, id) => (await run(user, `select id from public.${table} where id = $1`, [id])).rows.length === 1;
const report = (user, col, id, reason = 'harassment') =>
  run(user, `insert into public.reports (reporter_id, ${col}, reason) values ($1, $2, $3)`, [user, id, reason]);

before(async () => {
  db = await createTestDb();
  for (const [id, n] of [[alice, 'alice'], [bob, 'bob'], [carol, 'carol'], [dave, 'dave'], [erin, 'erin']]) {
    await createUser(db, id, `${n}@example.test`);
  }
});

describe('reporting', () => {
  it('accepts every reason, including hate', async () => {
    const id = await post(alice, 'reasons');
    await age(id);
    await report(bob, 'post_id', id, 'hate');
    const { rows } = await run(bob, `select reason from public.reports where post_id = $1`, [id]);
    assert.deepEqual(rows, [{ reason: 'hate' }]);
  });

  it('allows one open report per reporter per target', async () => {
    const id = await post(alice, 'dupe');
    await age(id);
    await report(bob, 'post_id', id);
    await assert.rejects(report(bob, 'post_id', id), /duplicate key/);
  });

  it('keeps reports private to the reporter', async () => {
    const { rows } = await run(carol, `select * from public.reports`);
    assert.equal(rows.length, 0);
  });
});

describe('hidden pending review after N reports', () => {
  it('threshold is 3', async () => {
    assert.equal((await db.query('select public.moderation_report_threshold() n')).rows[0].n, 3);
  });

  it('hides a post from others (author still sees it) after 3 distinct reporters', async () => {
    const id = await post(alice, 'reported a lot');
    await age(id);
    await report(bob, 'post_id', id);
    await report(carol, 'post_id', id);
    assert.equal(await sees(erin, 'posts', id), true);
    await report(dave, 'post_id', id);
    assert.equal(await sees(erin, 'posts', id), false);
    assert.equal(await sees(alice, 'posts', id), true);
    await assert.rejects(comment(erin, id, 'hi'), /row-level security/);
  });

  it('hides a comment after 3 distinct reporters', async () => {
    const pid = await post(alice, 'thread');
    const cid = await comment(alice, pid, 'a comment');
    await age(pid);
    for (const r of [bob, carol, dave]) await report(r, 'comment_id', cid);
    assert.equal(await sees(erin, 'comments', cid), false);
    assert.equal(await sees(alice, 'comments', cid), true);
  });

  it('does not count guest (anonymous) reporters toward the threshold', async () => {
    const guests = ['f1', 'f2', 'f3'].map(u);
    for (const g of guests) await db.query('insert into auth.users (id, email, is_anonymous) values ($1, null, true)', [g]);
    const id = await post(alice, 'guests reported this');
    await age(id);
    for (const g of guests) await report(g, 'post_id', id);
    assert.equal(await sees(erin, 'posts', id), true, '3 guest reports must not hide');
    const { rows } = await db.query('select count(*)::int n from public.reports where post_id = $1', [id]);
    assert.equal(rows[0].n, 3, 'guest reports are still stored');
    await report(bob, 'post_id', id);
    await report(carol, 'post_id', id);
    assert.equal(await sees(erin, 'posts', id), true, '2 real + 3 guest must not hide');
    await report(dave, 'post_id', id);
    assert.equal(await sees(erin, 'posts', id), false, '3 real reporters hide it');
  });

  it('does not let clients set or clear hidden_at', async () => {
    const id = await post(alice, 'mine');
    await assert.rejects(run(alice, `update public.posts set hidden_at = null where id = $1`, [id]), /permission denied/);
  });
});

describe('blocks hide content in both directions', () => {
  let p1, p2, c1, c2;
  before(async () => {
    const host = await post(carol, 'host');
    p1 = await post(alice, 'alice post');
    p2 = await post(bob, 'bob post');
    await age(host);
    c1 = await comment(alice, host, 'alice comment');
    c2 = await comment(bob, host, 'bob comment');
    for (const id of [host, p1, p2]) await age(id);
    assert.equal(await sees(bob, 'posts', p1), true);
    await run(alice, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [alice, bob]);
  });

  it('blocker cannot see the blocked user', async () => {
    assert.equal(await sees(alice, 'posts', p2), false);
    assert.equal(await sees(alice, 'comments', c2), false);
  });

  it('blocked user cannot see the blocker', async () => {
    assert.equal(await sees(bob, 'posts', p1), false);
    assert.equal(await sees(bob, 'comments', c1), false);
  });

  it('third parties still see both', async () => {
    assert.equal(await sees(carol, 'posts', p1), true);
    assert.equal(await sees(carol, 'comments', c2), true);
  });
});

describe('objectionable-content filter', () => {
  it('rejects a post caption with a blocklisted word, any case or punctuation', async () => {
    await assert.rejects(post(alice, 'What the FUCK!'), /objectionable content/);
  });

  it('rejects a comment body with a blocklisted word', async () => {
    const id = await post(alice, 'clean');
    await age(id);
    await assert.rejects(comment(bob, id, 'you retard'), /objectionable content/);
  });

  it('rejects editing a caption into objectionable text', async () => {
    const id = await post(alice, 'fine');
    await assert.rejects(run(alice, `update public.posts set caption = 'slut' where id = $1`, [id]), /objectionable content/);
  });

  it('matches whole words only (no Scunthorpe problem)', async () => {
    const id = await post(alice, 'Scunthorpe pheasants and a shitake... no, fagus trees');
    assert.ok(id);
  });

  it('hides the blocklist from clients', async () => {
    assert.equal((await run(alice, 'select * from public.blocklist_terms')).rows.length, 0);
  });
});

describe('community rules acceptance', () => {
  it('records acceptance once', async () => {
    const first = (await run(erin, 'select public.accept_community_rules() t')).rows[0].t;
    const again = (await run(erin, 'select public.accept_community_rules() t')).rows[0].t;
    assert.ok(first);
    assert.equal(first.getTime(), again.getTime());
  });
});
