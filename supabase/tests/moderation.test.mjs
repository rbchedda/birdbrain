import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-00000000000a';
const bob = '00000000-0000-4000-8000-00000000000b';
const carol = '00000000-0000-4000-8000-00000000000c';

let db;
let postId;

const post = (user, caption) =>
  as(db, 'authenticated', user, async (tx) => {
    const { rows } = await tx.query(
      `insert into public.posts (author_id, species, caption) values ($1, 'pheasant', $2) returning id`,
      [user, caption],
    );
    return rows[0].id;
  });
const visibleTo = async (user, id) =>
  (await as(db, 'authenticated', user, (tx) => tx.query('select id from public.posts where id = $1', [id]))).rows.length === 1;
const agePost = (id) => db.query(`update public.posts set public_after = now() - interval '1 minute' where id = $1`, [id]);

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
  await createUser(db, carol, 'carol@example.test');
  postId = await post(alice, 'two roosters');
});

describe('next-day delay (no live game alerts)', () => {
  it('sets public_after to next-day midnight Eastern or 12 hours, whichever is later', async () => {
    const { rows } = await db.query(
      `select public_after = public.public_after_for(created_at) ok,
              public_after >= public.next_day_et(created_at) next_day,
              public_after >= created_at + interval '12 hours' min_delay
         from public.posts where id = $1`,
      [postId],
    );
    assert.deepEqual(rows[0], { ok: true, next_day: true, min_delay: true });
  });

  it('handles the evening hours when UTC has already rolled over', async () => {
    const { rows } = await db.query(
      `select public.next_day_et('2026-11-14 23:30:00-05') a, public.next_day_et('2026-07-01 10:00:00-04') b`,
    );
    assert.equal(rows[0].a.toISOString(), '2026-11-15T05:00:00.000Z');
    assert.equal(rows[0].b.toISOString(), '2026-07-02T04:00:00.000Z');
  });

  it('shows a new post to its author but not to others', async () => {
    assert.equal(await visibleTo(alice, postId), true);
    assert.equal(await visibleTo(bob, postId), false);
  });

  it('does not let clients set public_after', async () => {
    await assert.rejects(
      as(db, 'authenticated', alice, (tx) =>
        tx.query(`update public.posts set public_after = now() - interval '1 day' where id = $1`, [postId]),
      ),
      /permission denied/,
    );
  });

  it('blocks comments and likes on posts that are not yet public', async () => {
    await assert.rejects(
      as(db, 'authenticated', bob, (tx) =>
        tx.query(`insert into public.comments (post_id, author_id, body) values ($1, $2, 'nice')`, [postId, bob]),
      ),
      /row-level security/,
    );
  });

  it('shows the post to others once the delay passes', async () => {
    await agePost(postId);
    assert.equal(await visibleTo(bob, postId), true);
    await as(db, 'authenticated', bob, (tx) =>
      tx.query(`insert into public.comments (post_id, author_id, body) values ($1, $2, 'nice birds')`, [postId, bob]),
    );
  });
});

describe('blocking', () => {
  it('hides posts and comments in both directions', async () => {
    assert.equal(await visibleTo(carol, postId), true);
    await as(db, 'authenticated', alice, (tx) =>
      tx.query('insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [alice, carol]),
    );
    assert.equal(await visibleTo(carol, postId), false);

    const carolPost = await post(carol, 'hello');
    await agePost(carolPost);
    assert.equal(await visibleTo(alice, carolPost), false);
    assert.equal(await visibleTo(bob, carolPost), true);
  });

  it('keeps block lists private to the blocker', async () => {
    const seen = await as(db, 'authenticated', carol, (tx) => tx.query('select * from public.user_blocks'));
    assert.equal(seen.rows.length, 0);
  });

  it('does not let users block on behalf of someone else', async () => {
    await assert.rejects(
      as(db, 'authenticated', bob, (tx) =>
        tx.query('insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [alice, bob]),
      ),
      /row-level security/,
    );
  });
});

describe('reports', () => {
  it('lets users report a post and see only their own reports', async () => {
    await as(db, 'authenticated', bob, (tx) =>
      tx.query(`insert into public.reports (reporter_id, post_id, reason) values ($1, $2, 'live_game_alert')`, [bob, postId]),
    );
    const mine = await as(db, 'authenticated', bob, (tx) => tx.query('select status from public.reports'));
    const theirs = await as(db, 'authenticated', alice, (tx) => tx.query('select * from public.reports'));
    assert.deepEqual(mine.rows, [{ status: 'open' }]);
    assert.equal(theirs.rows.length, 0);
  });

  it('requires exactly one target', async () => {
    await assert.rejects(
      as(db, 'authenticated', bob, (tx) =>
        tx.query(`insert into public.reports (reporter_id, post_id, profile_id, reason) values ($1, $2, $3, 'spam')`, [
          bob, postId, alice,
        ]),
      ),
      /check constraint/,
    );
  });

  it('does not let reporters close their own reports', async () => {
    await assert.rejects(
      as(db, 'authenticated', bob, (tx) => tx.query(`update public.reports set status = 'dismissed'`)),
      /permission denied/,
    );
  });
});

describe('ingest_state', () => {
  it('is invisible to app users', async () => {
    await db.query(`insert into public.ingest_state (source, layer_url) values ('x', 'https://x')`);
    const { rows } = await as(db, 'anon', null, (tx) => tx.query('select * from public.ingest_state'));
    assert.equal(rows.length, 0);
  });
});
