import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const alice = '00000000-0000-4000-8000-0000000000a1';
const bob = '00000000-0000-4000-8000-0000000000b1';
const carol = '00000000-0000-4000-8000-0000000000c1';
const clientId = '22222222-2222-4222-8222-222222222201';
const bobClient = '22222222-2222-4222-8222-222222222202';

let db;
let placeId;
let crewId;
let token;

const q = (user, sql, params = []) => as(db, 'authenticated', user, (tx) => tx.query(sql, params));
const rows = async (user, sql, params) => (await q(user, sql, params)).rows;
const anon = (sql, params = []) => as(db, 'anon', null, (tx) => tx.query(sql, params));

const details = {
  hours: 3.5,
  miles: 4.2,
  flushes: 6,
  shots: 5,
  cover: ['standing_corn'],
  birds: [{ species: 'pheasant', count: 2, roosters: 2, hens: 0 }],
  dogs: [{ dogId: 'd1', name: 'Ruby', points: 3, flushes: 4, retrieves: 2 }],
  photos: [{ id: 'p1', path: `${alice}/${clientId}/p1.jpg` }],
  weather: { tempF: 41, windMph: 8, windDir: 'NW', sky: 'overcast', precip: 'none' },
};

before(async () => {
  db = await createTestDb();
  await createUser(db, alice, 'alice@example.test');
  await createUser(db, bob, 'bob@example.test');
  await createUser(db, carol, 'carol@example.test');
  placeId = (
    await db.query(
      `insert into public.places (type, name, county, species, geom, source, source_id)
       values ('game_land', 'SGL Share Test', 'Centre', array['pheasant']::public.species[],
               extensions.st_setsrid(extensions.st_makepoint(-77.85, 40.80), 4326), 'test', 'share-1')
       returning id`,
    )
  ).rows[0].id;
  const placeCounts = JSON.stringify([
    { placeId, placeName: 'SGL Share Test', flushed: 2, roosters: 1, harvested: 1 },
  ]);
  // Hunt date in the past so live_at is already reached for most tests.
  await q(alice, 'select * from public.upsert_diary_entry($1, null, $2, $3, $4, $5::jsonb, $6::jsonb)', [
    clientId,
    'pheasant',
    'opening day with Ruby',
    '2026-10-01',
    placeCounts,
    JSON.stringify(details),
  ]);
  await q(bob, 'select * from public.upsert_diary_entry($1, null, $2, $3, $4, $5::jsonb, $6::jsonb)', [
    bobClient,
    'dove',
    'bob private',
    '2026-10-01',
    '[]',
    JSON.stringify({ shots: 1, photos: [] }),
  ]);
  crewId = (await rows(alice, `select public.create_crew($1) as id`, ['Share Crew']))[0].id;
  // Bob joins via invite.
  const invite = (await rows(alice, `select * from public.create_crew_invite($1)`, [crewId]))[0];
  await q(bob, `select public.join_crew($1)`, [invite.token]);
});

describe('private by default unchanged', () => {
  it('keeps diary and hunt log owner-only; anon denied on share_links', async () => {
    assert.equal((await rows(bob, 'select * from public.diary_entries')).length, 1);
    assert.equal((await rows(bob, 'select * from public.hunt_log_entries where client_id = $1', [clientId])).length, 0);
    await assert.rejects(anon('select * from public.diary_entries'), /permission denied/);
    await assert.rejects(anon('select * from public.hunt_log_entries'), /permission denied/);
    await assert.rejects(anon('select * from public.share_links'), /permission denied/);
  });
});

describe('owner create / revoke (crew)', () => {
  it('creates a crew link, stores only a hash, default ~30d expiry', async () => {
    const created = (await rows(alice, 'select * from public.create_diary_share_link($1, $2)', [clientId, crewId]))[0];
    token = created.token;
    assert.ok(token.length >= 32);
    assert.ok(created.link_id);
    assert.ok(created.expires_at);
    const days = (await db.query(
      `select round(extract(epoch from expires_at - created_at) / 86400)::int as d from public.share_links where id = $1`,
      [created.link_id],
    )).rows[0].d;
    assert.equal(days, 30);
    const status = (await rows(alice, 'select * from public.diary_share_status($1)', [clientId]))[0];
    assert.equal(status.shared, true);
    assert.equal(status.audience, 'crew');
    assert.equal(status.crew_id, crewId);
    assert.equal(
      (await db.query(`select count(*)::int n from public.share_links where token_hash = sha256(convert_to($1, 'UTF8')) and revoked_at is null`, [token]))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await db.query(`select count(*)::int n from public.share_links where encode(token_hash, 'escape') = $1`, [token])).rows[0].n,
      0,
    );
  });

  it('rotates on recreate and respects 7-day ttl', async () => {
    const old = token;
    const created = (await rows(alice, 'select * from public.create_diary_share_link($1, $2, $3)', [clientId, crewId, 7]))[0];
    token = created.token;
    assert.notEqual(token, old);
    const days = (await db.query(
      `select round(extract(epoch from expires_at - created_at) / 86400)::int as d from public.share_links where id = $1`,
      [created.link_id],
    )).rows[0].d;
    assert.equal(days, 7);
    assert.equal((await rows(bob, 'select * from public.read_crew_shared_diary($1)', [old])).length, 0);
  });

  it('revokes the active link', async () => {
    await q(alice, 'select public.revoke_diary_share_link($1)', [clientId]);
    const status = (await rows(alice, 'select * from public.diary_share_status($1)', [clientId]))[0];
    assert.equal(status.shared, false);
    assert.equal((await rows(bob, 'select * from public.read_crew_shared_diary($1)', [token])).length, 0);
  });
});

describe('non-owner / anon cannot manage', () => {
  it('blocks create for others, revoke for others, anon table reads', async () => {
    await assert.rejects(q(bob, 'select * from public.create_diary_share_link($1, $2)', [clientId, crewId]), /entry not found/);
    const t = (await rows(alice, 'select * from public.create_diary_share_link($1, $2)', [clientId, crewId]))[0];
    token = t.token;
    await assert.rejects(q(bob, 'select public.revoke_diary_share_link($1)', [clientId]), /entry not found/);
    await assert.rejects(anon('select * from public.create_diary_share_link($1, $2)', [clientId, crewId]), /permission denied/);
    await assert.rejects(anon('select * from public.share_links'), /permission denied/);
    assert.equal((await rows(bob, 'select * from public.share_links')).length, 0);
    const entryId = (await db.query('select id from public.hunt_log_entries where client_id = $1', [clientId])).rows[0].id;
    await assert.rejects(
      q(alice, `insert into public.share_links (entry_id, owner_id, token_hash, audience, crew_id, expires_at)
                values ($1, $2, decode('abcd','hex'), 'crew', $3, now() + interval '1 day')`, [entryId, alice, crewId]),
      /permission denied|row-level security/,
    );
  });
});

describe('read_crew_shared_diary', () => {
  it('crew member sees blurred safe fields after live_at; non-member gets nothing', async () => {
    const r = (await rows(bob, 'select * from public.read_crew_shared_diary($1)', [token]))[0];
    assert.equal(r.live, true);
    assert.equal(r.species, 'pheasant');
    assert.equal(r.caption, 'opening day with Ruby');
    assert.equal(r.county, 'Centre');
    assert.equal(Number(r.hours), 3.5);
    assert.equal(r.flushes, 6);
    assert.deepEqual(r.birds, [{ species: 'pheasant', count: 2 }]);
    assert.deepEqual(r.dog_names, ['Ruby']);
    assert.equal(r.has_photo, true);
    assert.ok(typeof r.blurred_lng === 'number');
    assert.equal(r.owner_id, undefined);
    assert.equal(r.photos, undefined);
    // Carol is not in the crew.
    assert.equal((await rows(carol, 'select * from public.read_crew_shared_diary($1)', [token])).length, 0);
    // Anon cannot call crew reader.
    await assert.rejects(anon('select * from public.read_crew_shared_diary($1)', [token]), /permission denied/);
  });
});

describe('public read_shared_diary (SQL flag defaults OFF)', () => {
  let pubToken;

  it('create_public and read are no-ops while the flag is off', async () => {
    await assert.rejects(
      rows(alice, 'select * from public.create_public_diary_share_link($1)', [clientId]),
      /public diary share is disabled/,
    );
    assert.equal((await anon('select * from public.read_shared_diary($1)', ['anything'])).rows.length, 0);
  });

  it('returns only county + blur when live; empty for crew tokens', async () => {
    // Enable for the remaining public tests (hosted stays false until lawyer OK).
    await db.query(`
      create or replace function public.public_diary_share_enabled() returns boolean
      language sql immutable parallel safe set search_path = '' as $$ select true $$;
    `);
    // Crew token must not work on the public reader.
    assert.equal((await anon('select * from public.read_shared_diary($1)', [token])).rows.length, 0);

    const created = (await rows(alice, 'select * from public.create_public_diary_share_link($1)', [clientId]))[0];
    pubToken = created.token;
    // Rotating to public revoked the crew link.
    assert.equal((await rows(bob, 'select * from public.read_crew_shared_diary($1)', [token])).length, 0);

    const r = (await anon('select * from public.read_shared_diary($1)', [pubToken])).rows[0];
    assert.equal(r.live, true);
    assert.equal(r.county, 'Centre');
    assert.ok(typeof r.blurred_lng === 'number');
    assert.equal(r.species, undefined);
    assert.equal(r.caption, undefined);
    assert.equal(r.dogs, undefined);
  });

  it('pending before midnight ET after hunt; revoked/expired/invalid look the same', async () => {
    // Future hunt date → pending.
    const futureClient = '22222222-2222-4222-8222-222222222299';
    await q(alice, 'select * from public.upsert_diary_entry($1, null, $2, $3, $4, $5::jsonb, $6::jsonb)', [
      futureClient,
      'grouse',
      'tomorrow',
      '2099-11-07',
      JSON.stringify([{ placeId, placeName: 'SGL Share Test' }]),
      JSON.stringify({ hours: 1, flushes: 1, shots: 0, birds: [], cover: [], dogs: [], photos: [] }),
    ]);
    const pending = (await rows(alice, 'select * from public.create_public_diary_share_link($1)', [futureClient]))[0];
    const row = (await anon('select * from public.read_shared_diary($1)', [pending.token])).rows[0];
    assert.equal(row.live, false);
    assert.equal(row.county, null);
    assert.equal(row.blurred_lng, null);

    assert.equal((await anon('select * from public.read_shared_diary($1)', ['nope'])).rows.length, 0);
    await q(alice, 'select public.revoke_diary_share_link($1)', [clientId]);
    assert.equal((await anon('select * from public.read_shared_diary($1)', [pubToken])).rows.length, 0);

    // Expired: create then backdate expires_at.
    const again = (await rows(alice, 'select * from public.create_public_diary_share_link($1)', [clientId]))[0];
    // Push created_at back too so the expires_at > created_at check still holds.
    await db.query(
      `update public.share_links
          set created_at = now() - interval '2 days',
              expires_at = now() - interval '1 second'
        where id = $1`,
      [again.link_id],
    );
    assert.equal((await anon('select * from public.read_shared_diary($1)', [again.token])).rows.length, 0);
  });
});

describe('entry delete invalidates', () => {
  it('cascades share_links away', async () => {
    const created = (await rows(alice, 'select * from public.create_diary_share_link($1, $2)', [clientId, crewId]))[0];
    assert.equal((await rows(bob, 'select * from public.read_crew_shared_diary($1)', [created.token])).length, 1);
    await q(alice, 'delete from public.hunt_log_entries where client_id = $1', [clientId]);
    assert.equal((await rows(bob, 'select * from public.read_crew_shared_diary($1)', [created.token])).length, 0);
    assert.equal(
      (await db.query(`select count(*)::int n from public.share_links where token_hash = sha256(convert_to($1, 'UTF8'))`, [created.token]))
        .rows[0].n,
      0,
    );
  });
});

describe('view counts schema and bot filter', () => {
  it('counts table has no IP / viewer / time columns', async () => {
    const cols = (
      await db.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'share_link_view_counts'
          order by ordinal_position`,
      )
    ).rows.map((r) => r.column_name);
    assert.deepEqual(cols, ['link_id', 'view_count']);
    assert.ok(!cols.includes('ip'));
    assert.ok(!cols.includes('viewer_id'));
    assert.ok(!cols.includes('user_agent'));
    assert.ok(!cols.includes('viewed_at'));
  });

  it('share_link_user_agent_is_bot filters bots, crawlers, and link previews', async () => {
    const bot = async (ua) =>
      (await db.query(`select public.share_link_user_agent_is_bot($1) as b`, [ua])).rows[0].b;
    assert.equal(await bot(null), true);
    assert.equal(await bot(''), true);
    assert.equal(await bot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
    assert.equal(await bot('facebookexternalhit/1.1'), true);
    assert.equal(await bot('Slackbot-LinkExpanding 1.0'), true);
    assert.equal(await bot('Twitterbot/1.0'), true);
    assert.equal(await bot('bingpreview'), true);
    assert.equal(await bot('SomeCrawler/1.0'), true);
    assert.equal(await bot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'), false);
  });

  it('record_share_link_view increments for humans and skips bots; IP only in abuse log', async () => {
    await db.query(`
      create or replace function public.share_link_view_counts_enabled() returns boolean
      language sql immutable parallel safe set search_path = '' as $$ select true $$;
    `);
    const viewClient = '22222222-2222-4222-8222-2222222222a1';
    await q(alice, 'select * from public.upsert_diary_entry($1, null, $2, $3, $4, $5::jsonb, $6::jsonb)', [
      viewClient,
      'pheasant',
      'views',
      '2026-10-01',
      JSON.stringify([{ placeId, placeName: 'SGL Share Test' }]),
      JSON.stringify({ hours: 1, flushes: 1, shots: 0, birds: [], cover: [], dogs: [], photos: [] }),
    ]);
    const created = (await rows(alice, 'select * from public.create_diary_share_link($1, $2)', [viewClient, crewId]))[0];
    await anon(`select public.record_share_link_view($1, $2, $3)`, [
      created.token,
      'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0',
      '203.0.113.10',
    ]);
    await anon(`select public.record_share_link_view($1, $2, $3)`, [
      created.token,
      'Googlebot/2.1',
      '203.0.113.11',
    ]);
    const n = (
      await db.query(`select view_count from public.share_link_view_counts where link_id = $1`, [created.link_id])
    ).rows[0].view_count;
    assert.equal(Number(n), 1);
    const abuse = (
      await db.query(`select ip::text as ip from public.share_link_abuse_logs where link_id = $1`, [created.link_id])
    ).rows;
    assert.equal(abuse.length, 1);
    assert.ok(String(abuse[0].ip).startsWith('203.0.113.10'));
    const status = (await rows(alice, 'select * from public.diary_share_status($1)', [viewClient]))[0];
    assert.equal(Number(status.view_count), 1);
    // Restore flag off.
    await db.query(`
      create or replace function public.share_link_view_counts_enabled() returns boolean
      language sql immutable parallel safe set search_path = '' as $$ select false $$;
    `);
  });
});

describe('TTL max 365 and account deletion revokes links', () => {
  it('caps ttl at 365 days', async () => {
    const ttlClient = '22222222-2222-4222-8222-2222222222b1';
    await q(alice, 'select * from public.upsert_diary_entry($1, null, $2, $3, $4, $5::jsonb, $6::jsonb)', [
      ttlClient,
      'pheasant',
      'ttl',
      '2026-10-01',
      '[]',
      JSON.stringify({ hours: 1, flushes: 0, shots: 0, birds: [], cover: [], dogs: [], photos: [] }),
    ]);
    const created = (
      await rows(alice, 'select * from public.create_diary_share_link($1, $2, $3)', [ttlClient, crewId, 999])
    )[0];
    const days = (
      await db.query(
        `select round(extract(epoch from expires_at - created_at) / 86400)::int as d from public.share_links where id = $1`,
        [created.link_id],
      )
    ).rows[0].d;
    assert.equal(days, 365);
  });

  it('deleting the owner removes share_links via cascade', async () => {
    const doomed = '00000000-0000-4000-8000-0000000000d1';
    const doomedClient = '22222222-2222-4222-8222-2222222222c1';
    await createUser(db, doomed, 'doomed@example.test');
    await as(db, 'authenticated', doomed, (tx) =>
      tx.query('select * from public.upsert_diary_entry($1, null, $2, $3, $4, $5::jsonb, $6::jsonb)', [
        doomedClient,
        'grouse',
        'bye',
        '2026-10-01',
        '[]',
        JSON.stringify({ flushes: 1, photos: [] }),
      ]),
    );
    const crew = (await as(db, 'authenticated', doomed, (tx) => tx.query(`select public.create_crew($1) as id`, ['Doomed Crew']))).rows[0].id;
    const created = (
      await as(db, 'authenticated', doomed, (tx) =>
        tx.query('select * from public.create_diary_share_link($1, $2)', [doomedClient, crew]),
      )
    ).rows[0];
    assert.equal(
      (await db.query(`select count(*)::int n from public.share_links where id = $1`, [created.link_id])).rows[0].n,
      1,
    );
    await as(db, 'authenticated', doomed, (tx) => tx.query('select public.delete_my_account()'));
    assert.equal(
      (await db.query(`select count(*)::int n from public.share_links where id = $1`, [created.link_id])).rows[0].n,
      0,
    );
    assert.equal((await db.query(`select count(*)::int n from auth.users where id = $1`, [doomed])).rows[0].n, 0);
  });
});
