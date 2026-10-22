import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a2'; // crew admin
const bob = '00000000-0000-4000-8000-0000000000b2'; // member, later co-admin
const eve = '00000000-0000-4000-8000-0000000000e2'; // outsider

let db;
const q = (user, sql, params = []) => as(db, 'authenticated', user, (tx) => tx.query(sql, params));
const rows = async (user, sql, params) => (await q(user, sql, params)).rows;
// Same shape as a Supabase anonymous sign-in: role authenticated, real uid, is_anonymous claim.
const asGuest = (user, sql, params = []) =>
  db.transaction(async (tx) => {
    await tx.query('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: 'authenticated', is_anonymous: true })]);
    return tx.query(sql, params);
  });
const newCrew = async (u, name = 'Crew') => (await rows(u, 'select public.create_crew($1) id', [name]))[0].id;
const tokenFor = async (u, crew) => (await rows(u, 'select * from public.create_crew_invite($1)', [crew]))[0].token;
const crewWithBob = async () => {
  const crew = await newCrew(alice);
  await q(bob, 'select public.join_crew($1)', [await tokenFor(alice, crew)]);
  return crew;
};
const post = async (u, group) =>
  (await rows(u, `insert into public.posts (author_id, species, group_id, photo_path) values ($1, 'pheasant', $2, $3) returning id`, [u, group, `${u}/p.jpg`]))[0].id;

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'a2@example.test');
  await createUser(db, bob, 'b2@example.test');
  await createUser(db, eve, 'e2@example.test');
});

describe('must 1: anonymous JWT sessions are refused', () => {
  it('create_crew', async () => {
    await assert.rejects(asGuest(eve, `select public.create_crew('Guest crew')`), /create an account/);
  });
  it('create_crew_invite (even for an admin whose session is anonymous)', async () => {
    const crew = await newCrew(alice);
    await assert.rejects(asGuest(alice, 'select * from public.create_crew_invite($1)', [crew]), /create an account/);
  });
  it('join_crew', async () => {
    const crew = await newCrew(alice);
    await assert.rejects(asGuest(eve, 'select public.join_crew($1)', [await tokenFor(alice, crew)]), /create an account/);
  });
  it('posting into a crew', async () => {
    const crew = await crewWithBob();
    await assert.rejects(asGuest(bob, `insert into public.posts (author_id, species, group_id) values ($1, 'pheasant', $2)`, [bob, crew]), /row-level security/);
  });
});

describe('must 2: deleting a crew deletes its content', () => {
  it('posts, comments, likes and photos go; nothing becomes public', async () => {
    const crew = await crewWithBob();
    const pid = await post(alice, crew);
    await db.query(`insert into storage.objects (bucket_id, name, owner) values ('post-photos', $1, $2)`, [`${alice}/p.jpg`, alice]).catch(() =>
      db.query(`insert into storage.objects (bucket_id, name) values ('post-photos', $1)`, [`${alice}/p.jpg`]),
    );
    // Seeded directly: the post is still inside its moderation delay, so RLS would hide it from bob.
    await db.query(`insert into public.comments (post_id, author_id, body) values ($1, $2, 'hi')`, [pid, bob]);
    await db.query('insert into public.likes (post_id, user_id) values ($1, $2)', [pid, bob]);
    await q(alice, 'delete from public.groups where id = $1', [crew]);
    for (const [t, col] of [['posts', 'id'], ['comments', 'post_id'], ['likes', 'post_id']])
      assert.equal((await db.query(`select 1 from public.${t} where ${col} = $1`, [pid])).rows.length, 0, t);
    assert.equal((await db.query(`select 1 from storage.objects where name = $1`, [`${alice}/p.jpg`])).rows.length, 0);
  });
  it('the last member leaving (auto-delete) also deletes the posts', async () => {
    const crew = await newCrew(alice);
    const pid = await post(alice, crew);
    await q(alice, 'select public.leave_crew($1)', [crew]);
    assert.equal((await db.query('select 1 from public.posts where id = $1', [pid])).rows.length, 0);
  });
  it('species groups keep set-null behaviour', async () => {
    const g = (await db.query(`insert into public.groups (slug, name) values ('tmp-species', 'Temp species') returning id`)).rows[0].id;
    const pid = (await db.query(`insert into public.posts (author_id, species, group_id) values ($1, 'pheasant', $2) returning id`, [eve, g])).rows[0].id;
    await db.query('delete from public.groups where id = $1', [g]);
    assert.deepEqual((await db.query('select group_id from public.posts where id = $1', [pid])).rows, [{ group_id: null }]);
  });
});

describe('must 3: posts.group_id is immutable', () => {
  it("can't move a crew post to public", async () => {
    const crew = await crewWithBob();
    const pid = await post(alice, crew);
    await assert.rejects(q(alice, 'update public.posts set group_id = null where id = $1', [pid]), /permission denied|can't change/);
    assert.equal((await db.query('select group_id from public.posts where id = $1', [pid])).rows[0].group_id, crew);
  });
  it("can't move a public post into a crew you're not in", async () => {
    const crew = await crewWithBob();
    const pid = await post(eve, null);
    await assert.rejects(q(eve, 'update public.posts set group_id = $2 where id = $1', [pid, crew]), /permission denied|can't change/);
  });
  it('even server-side updates (no column grant) are refused by the trigger', async () => {
    const crew = await crewWithBob();
    const pid = await post(alice, crew);
    await assert.rejects(db.query('update public.posts set group_id = null where id = $1', [pid]), /can't change/);
  });
  it('other edits still work', async () => {
    const pid = await post(eve, null);
    await q(eve, `update public.posts set caption = 'edited' where id = $1`, [pid]);
  });
});

describe('admins and other admins', () => {
  const twoAdmins = async () => {
    const crew = await crewWithBob();
    await q(alice, `update public.group_members set role = 'admin' where group_id = $1 and user_id = $2`, [crew, bob]);
    return crew;
  };
  it("an admin can't demote another admin", async () => {
    const crew = await twoAdmins();
    await assert.rejects(q(alice, `update public.group_members set role = 'member' where group_id = $1 and user_id = $2`, [crew, bob]), /step down themselves/);
  });
  it("an admin can't remove another admin", async () => {
    const crew = await twoAdmins();
    await q(alice, 'delete from public.group_members where group_id = $1 and user_id = $2', [crew, bob]).catch((e) => {
      assert.match(e.message, /can't remove other admins/);
    });
    assert.equal((await db.query('select role from public.group_members where group_id = $1 and user_id = $2', [crew, bob])).rows[0]?.role, 'admin');
  });
  it('an admin can step down themselves while another admin remains, and can still remove members', async () => {
    const crew = await twoAdmins();
    await q(bob, `update public.group_members set role = 'member' where group_id = $1 and user_id = $2`, [crew, bob]);
    await q(alice, 'delete from public.group_members where group_id = $1 and user_id = $2', [crew, bob]);
    assert.equal((await db.query('select count(*)::int n from public.group_members where group_id = $1', [crew])).rows[0].n, 1);
  });
});

describe('crew names', () => {
  it('are trimmed and 1-40 characters', async () => {
    const id = await newCrew(alice, '  A  ');
    assert.equal((await db.query('select name from public.groups where id = $1', [id])).rows[0].name, 'A');
    await newCrew(alice, 'x'.repeat(40));
    await assert.rejects(newCrew(alice, 'x'.repeat(41)), /groups_name_check/);
    await assert.rejects(newCrew(alice, '   '), /groups_name_check/);
    await assert.rejects(db.query(`update public.groups set name = ' padded ' where id = $1`, [id]), /groups_name_check/);
  });
});

describe('caps hold under the group-row lock', () => {
  it('join_crew and create_crew_invite take FOR UPDATE on the group row', async () => {
    const src = (await db.query(`select proname, prosrc from pg_proc where proname in ('join_crew', 'create_crew_invite')`)).rows;
    for (const r of src) assert.match(r.prosrc, /from public\.groups g where g\.id = gid for update/, r.proname);
  });
});
