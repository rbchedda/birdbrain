import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a1'; // crew admin
const bob = '00000000-0000-4000-8000-0000000000b1'; // joins by invite
const eve = '00000000-0000-4000-8000-0000000000e1'; // never a member

let db;
let crew;
let token;

const q = (user, sql, params = []) => as(db, 'authenticated', user, (tx) => tx.query(sql, params));
const rows = async (user, sql, params) => (await q(user, sql, params)).rows;

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
  await createUser(db, eve, 'eve@example.test');
  crew = (await rows(alice, `select public.create_crew('Tuesday Dogs') id`))[0].id;
  token = (await rows(alice, `select * from public.create_crew_invite($1)`, [crew]))[0].token;
});

describe('create crew', () => {
  it('makes the creator the only admin of a private crew', async () => {
    assert.deepEqual(await rows(alice, 'select user_id, role from public.group_members where group_id = $1', [crew]), [
      { user_id: alice, role: 'admin' },
    ]);
    const g = (await rows(alice, 'select kind, is_official from public.groups where id = $1', [crew]))[0];
    assert.deepEqual(g, { kind: 'crew', is_official: false });
  });

  it("can't insert a crew row directly (only via create_crew)", async () => {
    await assert.rejects(
      q(eve, `insert into public.groups (slug, name, kind, created_by) values ('eve-crew', 'Eve crew', 'crew', $1)`, [eve]),
      /row-level security/,
    );
  });

  it('anon cannot call the RPCs', async () => {
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query(`select public.create_crew('Nope crew')`)), /permission denied/);
    await assert.rejects(as(db, 'anon', null, (tx) => tx.query(`select public.join_crew($1)`, [token])), /permission denied/);
  });
});

describe('non-members see nothing', () => {
  it('hides the crew, its members and its invites', async () => {
    assert.equal((await rows(eve, 'select id from public.groups where id = $1', [crew])).length, 0);
    assert.equal((await rows(eve, 'select 1 from public.group_members where group_id = $1', [crew])).length, 0);
    assert.equal((await rows(eve, 'select 1 from public.crew_invites where group_id = $1', [crew])).length, 0);
    assert.equal((await rows(eve, `select id from public.groups where kind = 'crew'`)).length, 0);
  });

  it('still shows species groups to everyone', async () => {
    assert.ok((await rows(eve, `select id from public.groups where kind = 'species'`)).length > 0);
  });

  it("can't self-join a crew without an invite", async () => {
    await assert.rejects(
      q(eve, `insert into public.group_members (group_id, user_id, role) values ($1, $2, 'member')`, [crew, eve]),
      /row-level security/,
    );
  });

  it("non-admins can't create invites", async () => {
    await assert.rejects(q(eve, 'select * from public.create_crew_invite($1)', [crew]), /only crew admins/);
  });

  it('crew posts are hidden from non-members even after the delay, and only members can post', async () => {
    const pid = (
      await rows(alice, `insert into public.posts (author_id, species, caption, group_id) values ($1, 'pheasant', 'crew only', $2) returning id`, [alice, crew])
    )[0].id;
    await db.query(`update public.posts set public_after = now() - interval '1 minute' where id = $1`, [pid]);
    assert.equal((await rows(eve, 'select id from public.posts where id = $1', [pid])).length, 0);
    assert.equal((await rows(eve, 'select public.can_see_post_id($1) ok', [pid]))[0].ok, false);
    assert.equal((await rows(alice, 'select id from public.posts where id = $1', [pid])).length, 1);
    await assert.rejects(
      q(eve, `insert into public.posts (author_id, species, group_id) values ($1, 'pheasant', $2)`, [eve, crew]),
      /row-level security/,
    );
  });
});

describe('join by invite', () => {
  it('rejects unknown tokens', async () => {
    await assert.rejects(q(bob, `select public.join_crew('nope')`), /invalid or expired/);
  });

  it('adds the joiner as a member, idempotently', async () => {
    assert.equal((await rows(bob, 'select public.join_crew($1) id', [token]))[0].id, crew);
    assert.equal((await rows(bob, 'select public.join_crew($1) id', [token]))[0].id, crew);
    assert.deepEqual(await rows(bob, 'select role from public.group_members where group_id = $1 and user_id = $2', [crew, bob]), [
      { role: 'member' },
    ]);
    assert.equal((await rows(bob, 'select 1 from public.group_members where group_id = $1', [crew])).length, 2);
    assert.equal((await rows(bob, 'select id from public.groups where id = $1', [crew])).length, 1);
  });

  it('members (not admins) cannot see invite tokens', async () => {
    assert.equal((await rows(bob, 'select 1 from public.crew_invites where group_id = $1', [crew])).length, 0);
  });

  it('rejects expired invites', async () => {
    const t = (await rows(alice, 'select * from public.create_crew_invite($1)', [crew]))[0].token;
    await db.query(
      `update public.crew_invites set created_at = now() - interval '7 days', expires_at = now() - interval '1 second'
        where token_hash = sha256(convert_to($1, 'UTF8'))`,
      [t],
    );
    await assert.rejects(q(eve, 'select public.join_crew($1)', [t]), /invalid or expired/);
  });

  it('rejects revoked invites', async () => {
    const t = (await rows(alice, 'select * from public.create_crew_invite($1)', [crew]))[0].token;
    await q(alice, 'update public.crew_invites set revoked_at = now() where group_id = $1 and revoked_at is null', [crew]);
    await assert.rejects(q(eve, 'select public.join_crew($1)', [t]), /invalid or expired/);
  });

  it('stores only a hash of the token', async () => {
    const r = await db.query('select count(*)::int n from public.crew_invites where encode(token_hash, $2) = $1', [token, 'escape']);
    assert.equal(r.rows[0].n, 0);
  });
});

describe('roles', () => {
  it("a member can't promote themselves to admin", async () => {
    const r = await q(bob, `update public.group_members set role = 'admin' where group_id = $1 and user_id = $2`, [crew, bob]);
    assert.equal(r.affectedRows, 0);
    assert.equal((await db.query('select role from public.group_members where user_id = $1', [bob])).rows[0].role, 'member');
  });

  it("a member can't remove others or rename the crew", async () => {
    const d = await q(bob, 'delete from public.group_members where group_id = $1 and user_id = $2', [crew, alice]);
    assert.equal(d.affectedRows, 0);
    const u = await q(bob, `update public.groups set name = 'Bob crew' where id = $1`, [crew]);
    assert.equal(u.affectedRows, 0);
  });

  it("an admin can't flip a crew into a species group", async () => {
    await assert.rejects(q(alice, `update public.groups set kind = 'species' where id = $1`, [crew]), /kind cannot change/);
  });

  it('a member can leave; then sees nothing again', async () => {
    await q(bob, 'delete from public.group_members where group_id = $1 and user_id = $2', [crew, bob]);
    assert.equal((await rows(bob, 'select id from public.groups where id = $1', [crew])).length, 0);
  });

  it('an admin can remove a member', async () => {
    const t = (await rows(alice, 'select * from public.create_crew_invite($1)', [crew]))[0].token;
    await q(eve, 'select public.join_crew($1)', [t]);
    const d = await q(alice, 'delete from public.group_members where group_id = $1 and user_id = $2', [crew, eve]);
    assert.equal(d.affectedRows, 1);
  });
});
