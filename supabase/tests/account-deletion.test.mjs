import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a1';
const bob = '00000000-0000-4000-8000-0000000000b1';

let db;
const ids = {};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const count = async (sql, params) => Number((await one(sql, params)).n);

// Rows tied to a user anywhere in the schema.
const footprint = async (u) => ({
  authUser: await count('select count(*) n from auth.users where id = $1', [u]),
  profile: await count('select count(*) n from public.profiles where id = $1', [u]),
  posts: await count('select count(*) n from public.posts where author_id = $1', [u]),
  locations: await count('select count(*) n from public.post_locations l join public.posts p on p.id = l.post_id where p.author_id = $1', [u]),
  comments: await count('select count(*) n from public.comments where author_id = $1', [u]),
  likes: await count('select count(*) n from public.likes where user_id = $1', [u]),
  saves: await count('select count(*) n from public.saves where user_id = $1', [u]),
  members: await count('select count(*) n from public.group_members where user_id = $1', [u]),
  blocks: await count('select count(*) n from public.user_blocks where blocker_id = $1 or blocked_id = $1', [u]),
  reports: await count('select count(*) n from public.reports where reporter_id = $1 or profile_id = $1', [u]),
  // Files not yet queued for Storage API deletion (the DB never deletes them itself).
  photos: await count(
    `select count(*) n from storage.objects o where o.bucket_id = 'post-photos' and o.name like $1
        and not exists (select 1 from public.storage_deletion_queue q where q.bucket_id = o.bucket_id and q.path = o.name)`,
    [`${u}/%`],
  ),
  groupsCreated: await count('select count(*) n from public.groups where created_by = $1', [u]),
});

async function seed(u, other, slug) {
  const groupId = (await one(`insert into public.groups (slug, name, created_by) values ($1, $2, $3) returning id`, [slug, `Group ${slug}`, u])).id;
  await db.query('insert into public.group_members (group_id, user_id) values ($1, $2), ($1, $3)', [groupId, u, other]);
  const postId = (await one(
    `insert into public.posts (author_id, species, caption, photo_path, group_id) values ($1, 'pheasant', 'mine', $2, $3) returning id`,
    [u, `${u}/a.jpg`, groupId],
  )).id;
  await db.query(`insert into public.post_locations (post_id, geom) values ($1, extensions.st_setsrid(extensions.st_makepoint(-76.3, 40.0), 4326))`, [postId]);
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('post-photos', $1, $2)`, [`${u}/a.jpg`, u]);
  await db.query('insert into public.comments (post_id, author_id, body) values ($1, $2, $3)', [postId, u, 'own']);
  await db.query('insert into public.likes (post_id, user_id) values ($1, $2)', [postId, u]);
  await db.query('insert into public.saves (post_id, user_id) values ($1, $2)', [postId, u]);
  await db.query('insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [u, other]);
  await db.query(`insert into public.reports (reporter_id, profile_id, reason) values ($1, $2, 'spam')`, [u, other]);
  return { groupId, postId };
}

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
  ids.alice = await seed(alice, bob, 'alice-group');
  ids.bob = await seed(bob, alice, 'bob-group');
  // Cross-user activity: bob comments on and likes alice's post, and vice versa.
  await db.query('insert into public.comments (post_id, author_id, body) values ($1, $2, $3)', [ids.alice.postId, bob, 'bob on alice']);
  await db.query('insert into public.comments (post_id, author_id, body) values ($1, $2, $3)', [ids.bob.postId, alice, 'alice on bob']);
  await db.query('insert into public.likes (post_id, user_id) values ($1, $2)', [ids.bob.postId, alice]);
});

describe('delete_my_account()', () => {
  it('starts with data for both users', async () => {
    const f = await footprint(alice);
    for (const [k, v] of Object.entries(f)) assert.ok(v > 0, `alice has ${k}`);
  });

  it('refuses anonymous callers', async () => {
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query('select public.delete_my_account()')));
    await assert.rejects(as(db, 'authenticated', null, (tx) => tx.query('select public.delete_my_account()')), /not signed in/);
  });

  it('removes every trace of the caller', async () => {
    const before = await footprint(bob);
    await as(db, 'authenticated', alice, (tx) => tx.query('select public.delete_my_account()'));
    const f = await footprint(alice);
    for (const [k, v] of Object.entries(f)) assert.equal(v, 0, `alice ${k} gone`);
    // Alice's comment on bob's post and like are gone too; bob's comment on alice's deleted post goes with the post.
    assert.equal(await count('select count(*) n from public.comments where author_id = $1 and post_id = $2', [alice, ids.bob.postId]), 0);
    assert.equal(await count('select count(*) n from public.comments where post_id = $1', [ids.alice.postId]), 0);
    // Bob still has everything except rows that pointed at alice.
    const after = await footprint(bob);
    assert.deepEqual(after, { ...before, blocks: 0, reports: 0, comments: before.comments - 1 });
  });

  it('keeps the group alice created for other members, anonymized', async () => {
    const g = await one('select created_by from public.groups where id = $1', [ids.alice.groupId]);
    assert.equal(g.created_by, null);
    assert.equal(await count('select count(*) n from public.group_members where group_id = $1', [ids.alice.groupId]), 1);
  });

  it('leaves the other user fully intact', async () => {
    assert.equal(await count('select count(*) n from auth.users where id = $1', [bob]), 1);
    assert.equal(await count('select count(*) n from public.posts where id = $1', [ids.bob.postId]), 1);
    assert.equal(await count('select count(*) n from public.post_locations where post_id = $1', [ids.bob.postId]), 1);
    assert.equal(await count(`select count(*) n from storage.objects where name = $1`, [`${bob}/a.jpg`]), 1);
    assert.equal(await count('select count(*) n from public.groups where id = $1 and created_by = $2', [ids.bob.groupId, bob]), 1);
  });

  it('cannot delete someone else', async () => {
    await as(db, 'authenticated', alice, (tx) => tx.query('select public.delete_my_account()'));
    assert.equal(await count('select count(*) n from auth.users where id = $1', [bob]), 1);
  });
});
