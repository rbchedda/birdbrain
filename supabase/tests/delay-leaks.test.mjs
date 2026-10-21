// Regression tests for the delay-bypass leaks found in the Oct 2026 review.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a1';
const bob = '00000000-0000-4000-8000-0000000000b1';
const carol = '00000000-0000-4000-8000-0000000000c1';

let db;

const q = (user, sql, params = []) => as(db, 'authenticated', user, (tx) => tx.query(sql, params));
const post = async (user, caption = 'roosters', photo = null) =>
  (await q(user, `insert into public.posts (author_id, species, caption, photo_path) values ($1, 'pheasant', $2, $3) returning id`, [user, caption, photo])).rows[0].id;
const agePost = (id) => db.query(`update public.posts set public_after = now() - interval '1 minute' where id = $1`, [id]);
const comment = async (user, postId, body) =>
  (await q(user, `insert into public.comments (post_id, author_id, body) values ($1, $2, $3) returning id`, [postId, user, body])).rows[0].id;
const ageComment = (id) => db.query(`update public.comments set public_after = now() - interval '1 minute' where id = $1`, [id]);
const seesComment = async (user, id) => (await q(user, 'select id from public.comments where id = $1', [id])).rows.length === 1;

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'a@example.test');
  await createUser(db, bob, 'b@example.test');
  await createUser(db, carol, 'c@example.test');
});

describe('comment delay', () => {
  it('hides a new comment on a public post from everyone but its author', async () => {
    const p = await post(alice);
    await agePost(p);
    const c = await comment(bob, p, 'two more flushed by the corn, still there');
    assert.equal(await seesComment(bob, c), true);
    assert.equal(await seesComment(alice, c), false);
    assert.equal(await seesComment(carol, c), false);
    await ageComment(c);
    assert.equal(await seesComment(alice, c), true);
    assert.equal(await seesComment(carol, c), true);
  });

  it('sets public_after from the comment time, not the post time', async () => {
    const p = await post(alice);
    await db.query(`update public.posts set public_after = now() - interval '3 days' where id = $1`, [p]);
    const c = await comment(alice, p, 'later note');
    const { rows } = await db.query('select public_after > now() later from public.comments where id = $1', [c]);
    assert.equal(rows[0].later, true);
  });

  it('does not let clients set created_at or public_after on comments', async () => {
    const p = await post(alice);
    await agePost(p);
    await assert.rejects(
      q(bob, `insert into public.comments (post_id, author_id, body, public_after) values ($1, $2, 'x', now() - interval '1 day')`, [p, bob]),
      /permission denied/,
    );
    await assert.rejects(
      q(bob, `insert into public.comments (post_id, author_id, body, created_at) values ($1, $2, 'x', now() - interval '1 day')`, [p, bob]),
      /permission denied/,
    );
  });

  it('still hides aged comments across a block', async () => {
    const p = await post(alice);
    await agePost(p);
    const c = await comment(carol, p, 'nice');
    await ageComment(c);
    await q(bob, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [bob, carol]);
    assert.equal(await seesComment(bob, c), false);
    assert.equal(await seesComment(alice, c), true);
  });
});
