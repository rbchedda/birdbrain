// PGlite: Supabase Low hardening (sweeps 2026-11-08 / 2026-11-09).
// Repo files only; nothing is applied to hosted.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { as, createTestDb, createUser } from './db.mjs';

const u = (n) => `00000000-0000-4000-8000-0000000004${n}`;
const [alice, bob, carol, smoke] = ['a1', 'b1', 'c1', 'd1'].map(u);

let db;
const run = (user, sql, params = []) => as(db, 'authenticated', user, (tx) => tx.query(sql, params));
const anon = (sql, params = []) => as(db, 'anon', null, (tx) => tx.query(sql, params));

const ageLink = (linkId) =>
  db.query(`update public.share_links set created_at = now() - interval '13 hours' where id = $1`, [linkId]);

async function seedEntry(user, clientId, huntedOn = '2026-10-01') {
  const place = (
    await db.query(
      `select id from public.places where source_id = 'low-hard-1'`,
    )
  ).rows[0];
  await run(
    user,
    'select * from public.upsert_diary_entry($1, null, $2, $3, $4, $5::jsonb, $6::jsonb)',
    [
      clientId,
      'pheasant',
      'journal',
      huntedOn,
      JSON.stringify([{ placeId: place.id, placeName: 'SGL Low' }]),
      JSON.stringify({ hours: 1, flushes: 1, shots: 0, birds: [], cover: [], dogs: [], photos: [] }),
    ],
  );
}

before(async () => {
  db = await createTestDb();
  for (const id of [alice, bob, carol, smoke]) await createUser(db, id, `${id}@example.test`);
  await db.query('insert into private.test_accounts (user_id, label) values ($1, $2)', [smoke, 'smoke']);
  await db.query(
    `insert into public.places (type, name, county, species, geom, source, source_id)
     values ('game_land', 'SGL Low', 'Centre', array['pheasant']::public.species[],
             extensions.st_setsrid(extensions.st_makepoint(-77.85, 40.80), 4326), 'test', 'low-hard-1')`,
  );
});

describe('L1 smoke isolation: groups + visible profile fields', () => {
  it('blocks test-account species-group inserts; real users can still insert', async () => {
    await assert.rejects(
      run(
        smoke,
        `insert into public.groups (slug, name, kind, is_official, created_by)
         values ('smoke-club', 'Smoke Club', 'species', false, $1)`,
        [smoke],
      ),
      (e) => e.code === '42501' && /test accounts cannot write groups/.test(e.message),
    );
    await run(
      alice,
      `insert into public.groups (slug, name, kind, is_official, created_by)
       values ('alice-club', 'Alice Club', 'species', false, $1)`,
      [alice],
    );
  });

  it('blocks username/display_name updates for test accounts; has_dog still works', async () => {
    await assert.rejects(
      run(smoke, `update public.profiles set username = 'smoke_user' where id = $1`, [smoke]),
      (e) => e.code === '42501' && /visible profile fields/.test(e.message),
    );
    await assert.rejects(
      run(smoke, `update public.profiles set display_name = 'Smoke' where id = $1`, [smoke]),
      (e) => e.code === '42501' && /visible profile fields/.test(e.message),
    );
    await run(smoke, `update public.profiles set has_dog = true where id = $1`, [smoke]);
    assert.equal((await db.query('select has_dog from public.profiles where id = $1', [smoke])).rows[0].has_dog, true);
  });
});

describe('L2 is_test_account() has no uid parameter; guards still fire', () => {
  it('does not accept an arbitrary uid and cannot be called by anon', async () => {
    await assert.rejects(run(alice, 'select public.is_test_account($1)', [smoke]), /function public.is_test_account/);
    assert.equal((await run(smoke, 'select public.is_test_account() v')).rows[0].v, true);
    assert.equal((await run(alice, 'select public.is_test_account() v')).rows[0].v, false);
    await assert.rejects(anon('select public.is_test_account()'), /permission denied/);
  });

  it('still blocks test-account posts and crew-plan shares', async () => {
    await assert.rejects(
      run(smoke, `insert into public.posts (author_id, species) values ($1, 'pheasant')`, [smoke]),
      (e) => e.code === '42501' && e.message === 'test accounts cannot write posts',
    );
    const crew = (await run(alice, `select public.create_crew('Hard Crew') as id`)).rows[0].id;
    await run(smoke, `insert into public.plans (client_id, place_id, place_name, plan_date, notes) values (gen_random_uuid(),'p','p',current_date,'n')`);
    await assert.rejects(
      run(smoke, `update public.plans set crew_id = $1`, [crew]),
      (e) => e.code === '42501' && e.message === 'test accounts cannot share plans',
    );
  });
});

describe('L3 share_links / crew_invites column grants and max TTL', () => {
  it('lets the owner set only revoked_at; expires_at is capped at 365 days', async () => {
    const clientId = '22222222-2222-4222-8222-222222222401';
    await seedEntry(alice, clientId);
    const created = (await run(alice, 'select * from public.create_diary_share_link($1, (select id from public.groups where name = $2 and kind = $3 limit 1))', [clientId, 'Hard Crew', 'crew'])).rows[0];
    await assert.rejects(
      run(alice, `update public.share_links set expires_at = now() + interval '400 days' where id = $1`, [created.link_id]),
      /permission denied/,
    );
    await assert.rejects(
      run(alice, `update public.share_links set created_at = now() - interval '1 year' where id = $1`, [created.link_id]),
      /permission denied/,
    );
    await run(alice, `update public.share_links set revoked_at = now() where id = $1`, [created.link_id]);
    await assert.rejects(
      db.query(
        `insert into public.share_links (entry_id, owner_id, token_hash, audience, crew_id, expires_at)
         values ((select id from public.hunt_log_entries where client_id = $1), $2, decode('abcd1234','hex'), 'crew',
                 (select id from public.groups where name = 'Hard Crew' and kind = 'crew' limit 1),
                 now() + interval '366 days')`,
        [clientId, alice],
      ),
      /share_links_max_365_days/,
    );
  });

  it('lets crew admins revoke invites but not rewrite created_at or expires_at', async () => {
    const crew = (await db.query(`select id from public.groups where name = 'Hard Crew' and kind = 'crew'`)).rows[0].id;
    const inv = (await run(alice, 'select * from public.create_crew_invite($1)', [crew])).rows[0];
    await assert.rejects(
      run(alice, `update public.crew_invites set expires_at = now() + interval '30 days' where token_hash = sha256(convert_to($1, 'UTF8'))`, [inv.token]),
      /permission denied/,
    );
    await assert.rejects(
      run(alice, `update public.crew_invites set created_at = now() - interval '8 days' where token_hash = sha256(convert_to($1, 'UTF8'))`, [inv.token]),
      /permission denied/,
    );
    await run(alice, `update public.crew_invites set revoked_at = now() where token_hash = sha256(convert_to($1, 'UTF8'))`, [inv.token]);
  });
});

describe('L4 crew diary share revoked when the owner leaves', () => {
  it('revokes the link on leave and requires owner membership to read', async () => {
    const clientId = '22222222-2222-4222-8222-222222222402';
    await seedEntry(alice, clientId);
    const crew = (await db.query(`select id from public.groups where name = 'Hard Crew' and kind = 'crew'`)).rows[0].id;
    const invite = (await run(alice, 'select * from public.create_crew_invite($1)', [crew])).rows[0];
    await run(bob, 'select public.join_crew($1)', [invite.token]);
    const created = (await run(alice, 'select * from public.create_diary_share_link($1, $2)', [clientId, crew])).rows[0];
    await ageLink(created.link_id);
    assert.equal((await run(bob, 'select * from public.read_crew_shared_diary($1)', [created.token])).rows.length, 1);

    await run(alice, 'select public.leave_crew($1)', [crew]);
    assert.equal(
      (await db.query(`select revoked_at is not null as r from public.share_links where id = $1`, [created.link_id])).rows[0].r,
      true,
    );
    assert.equal((await run(bob, 'select * from public.read_crew_shared_diary($1)', [created.token])).rows.length, 0);

    // A leftover active row (immutability trigger forbids un-revoking) is still
    // hidden if the owner is no longer a member.
    const orphanToken = 'orphan-crew-share-token-xxxx';
    await db.query(
      `insert into public.share_links (entry_id, owner_id, token_hash, audience, crew_id, expires_at, created_at)
       select entry_id, owner_id, sha256(convert_to($2, 'UTF8')), 'crew', crew_id,
              now() + interval '30 days', now() - interval '13 hours'
         from public.share_links where id = $1`,
      [created.link_id, orphanToken],
    );
    assert.equal((await run(bob, 'select * from public.read_crew_shared_diary($1)', [orphanToken])).rows.length, 0);
  });
});

describe('L5 plans verdict snapshot constraints', () => {
  it('rejects a snapshot when the opt-in is off, and rejects an oversized snapshot', async () => {
    const id = (
      await run(
        alice,
        `insert into public.plans (client_id, place_id, place_name, plan_date, notes, show_spot_verdict_to_crew)
         values (gen_random_uuid(), 'p', 'p', current_date, 'n', false) returning id`,
      )
    ).rows[0].id;
    await assert.rejects(
      run(alice, `update public.plans set spot_verdict_snapshot = '{"word":"Slow"}'::jsonb where id = $1`, [id]),
      /plans_spot_verdict_snapshot_opt_in/,
    );
    await run(
      alice,
      `update public.plans set show_spot_verdict_to_crew = true,
              spot_verdict_snapshot = '{"word":"Slow","line":"x","crewHonestLine":"y","stockingLine":null,"dots":[],"huntsCounted":1,"frozen":false,"computedAt":"2026-11-01T00:00:00Z","reference":"2026-11-01"}'::jsonb
        where id = $1`,
      [id],
    );
    const huge = 'x'.repeat(9000);
    await assert.rejects(
      run(alice, `update public.plans set spot_verdict_snapshot = $2::jsonb where id = $1`, [id, JSON.stringify({ word: 'Slow', pad: huge })]),
      /plans_spot_verdict_snapshot_size/,
    );
  });
});

describe('L8 profiles column grants', () => {
  it('allows only username, display_name, has_dog; accept_community_rules still works', async () => {
    await run(carol, `update public.profiles set username = 'carol_l', display_name = 'Carol', has_dog = true where id = $1`, [carol]);
    await assert.rejects(
      run(carol, `update public.profiles set rules_accepted_at = now() where id = $1`, [carol]),
      /permission denied/,
    );
    await assert.rejects(
      run(carol, `update public.profiles set created_at = now() - interval '1 year' where id = $1`, [carol]),
      /permission denied/,
    );
    await assert.rejects(
      run(carol, `update public.profiles set onboarded_at = now() where id = $1`, [carol]),
      /permission denied/,
    );
    await assert.rejects(
      run(carol, `update public.profiles set avatar_path = 'x' where id = $1`, [carol]),
      /permission denied/,
    );
    await assert.rejects(
      run(carol, `update public.profiles set home_state = 'PA' where id = $1`, [carol]),
      /permission denied/,
    );
    const accepted = (await run(carol, 'select public.accept_community_rules() as t')).rows[0].t;
    assert.ok(accepted);
    assert.ok((await db.query('select rules_accepted_at from public.profiles where id = $1', [carol])).rows[0].rules_accepted_at);
  });
});

describe('L10 server-owned hunt_log created_at and share delay', () => {
  it('forces created_at to now() on insert and keeps it immutable, including when the client sends a value', async () => {
    const clientId = '22222222-2222-4222-8222-222222222403';
    await run(
      alice,
      `insert into public.hunt_log_entries (owner_id, client_id, species, caption, hunted_on, created_at)
       values ($1, $2, 'grouse', 'old', '2020-01-01', now() - interval '30 days')`,
      [alice, clientId],
    );
    const row = (await db.query(`select created_at > now() - interval '1 minute' as fresh, created_at as ts from public.hunt_log_entries where client_id = $1`, [clientId])).rows[0];
    assert.equal(row.fresh, true);
    const ts = row.ts;
    await run(alice, `update public.hunt_log_entries set caption = 'edited', created_at = now() - interval '30 days' where client_id = $1`, [clientId]);
    const after = (await db.query(`select created_at from public.hunt_log_entries where client_id = $1`, [clientId])).rows[0].created_at;
    assert.equal(new Date(after).toISOString(), new Date(ts).toISOString());
  });

  it('does not treat a fresh share of a backdated hunt as live', async () => {
    const clientId = '22222222-2222-4222-8222-222222222404';
    await seedEntry(alice, clientId, '2020-01-01');
    // Recreate a crew for alice after she left Hard Crew.
    const crew = (await run(alice, `select public.create_crew('Delay Crew') as id`)).rows[0].id;
    const invite = (await run(alice, 'select * from public.create_crew_invite($1)', [crew])).rows[0];
    await run(bob, 'select public.join_crew($1)', [invite.token]);
    const created = (await run(alice, 'select * from public.create_diary_share_link($1, $2)', [clientId, crew])).rows[0];
    const pending = (await run(bob, 'select * from public.read_crew_shared_diary($1)', [created.token])).rows[0];
    assert.equal(pending.live, false);
    await ageLink(created.link_id);
    const live = (await run(bob, 'select * from public.read_crew_shared_diary($1)', [created.token])).rows[0];
    assert.equal(live.live, true);
  });
});

describe('live L4/L5 leftover grants and trigger helpers, including reject_objectionable', () => {
  it('revokes TRUNCATE and unexpected DML, and EXECUTE on trigger helpers', async () => {
    const trunc = (
      await db.query(`select has_table_privilege('authenticated', 'public.posts', 'TRUNCATE') t,
                             has_table_privilege('authenticated', 'public.places', 'INSERT') i`)
    ).rows[0];
    assert.equal(trunc.t, false);
    assert.equal(trunc.i, false);
    await assert.rejects(run(alice, 'select public.handle_new_user()'), /permission denied/);
    await assert.rejects(run(alice, 'select public.reject_objectionable()'), /permission denied/);
    await assert.rejects(run(alice, 'select public.sync_post_counts()'), /permission denied/);
    await assert.rejects(run(alice, 'select public.hide_reported_content()'), /permission denied/);
  });

  it('still creates a profile on sign-up and still rejects objectionable content', async () => {
    const newbie = u('e1');
    await createUser(db, newbie, `${newbie}@example.test`);
    assert.equal((await db.query('select count(*)::int n from public.profiles where id = $1', [newbie])).rows[0].n, 1);
    await assert.rejects(
      run(alice, `insert into public.posts (author_id, species, caption) values ($1, 'pheasant', 'fuck this')`, [alice]),
      /objectionable/,
    );
    await assert.rejects(
      run(alice, `update public.profiles set username = 'big_fuck' where id = $1`, [alice]),
      /objectionable/,
    );
  });
});

describe('repo L6/L7 public share hardening (flags stay off by default)', () => {
  it('keeps the SQL flags off', async () => {
    assert.equal((await db.query('select public.public_diary_share_enabled() v')).rows[0].v, false);
    assert.equal((await db.query('select public.share_link_view_counts_enabled() v')).rows[0].v, false);
  });

  it('validates tokens, caps reports, takes IP from headers, and returns county only', async () => {
    await db.query(`
      create or replace function public.public_diary_share_enabled() returns boolean
      language sql immutable parallel safe set search_path = '' as $$ select true $$;
    `);
    await db.query(`
      create or replace function public.share_link_view_counts_enabled() returns boolean
      language sql immutable parallel safe set search_path = '' as $$ select true $$;
    `);
    const clientId = '22222222-2222-4222-8222-222222222405';
    await seedEntry(alice, clientId);
    const created = (await run(alice, 'select * from public.create_public_diary_share_link($1)', [clientId])).rows[0];
    await ageLink(created.link_id);

    await assert.rejects(
      anon('select public.report_shared_diary($1, $2)', ['not-a-real-token-at-all', 'spam']),
      /invalid report/,
    );
    await anon('select public.report_shared_diary($1, $2, $3, $4)', [created.token, 'spam', null, 'a@example.test']);
    for (let i = 0; i < 9; i++) {
      await anon('select public.report_shared_diary($1, $2)', [created.token, 'spam']);
    }
    await assert.rejects(
      anon('select public.report_shared_diary($1, $2)', [created.token, 'spam']),
      /invalid report/,
    );

    const r = (await anon('select * from public.read_shared_diary($1)', [created.token])).rows[0];
    assert.equal(r.live, true);
    assert.equal(r.county, 'Centre');
    assert.equal(r.blurred_lng, null);
    assert.equal(r.blurred_lat, null);

    await as(db, 'anon', null, async (tx) => {
      await tx.query(`select set_config('request.headers', $1, true)`, [
        JSON.stringify({ 'x-forwarded-for': '203.0.113.50, 10.0.0.1' }),
      ]);
      await tx.query(`select public.record_share_link_view($1, $2, $3)`, [
        created.token,
        'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0',
        '192.0.2.1',
      ]);
    });
    const abuse = (
      await db.query(`select ip::text as ip from public.share_link_abuse_logs where link_id = $1 order by id desc limit 1`, [
        created.link_id,
      ])
    ).rows[0];
    assert.ok(String(abuse.ip).startsWith('203.0.113.50'));

    await db.query(
      `update public.public_share_reports set created_at = now() - interval '40 days'
        where token_hash = sha256(convert_to($1, 'UTF8')) and contact_email is not null`,
      [created.token],
    );
    const n = (await db.query(`select public.purge_share_retention(interval '7 days', interval '30 days') n`)).rows[0].n;
    assert.ok(n >= 1);
    assert.equal(
      (
        await db.query(
          `select count(*)::int c from public.public_share_reports
            where token_hash = sha256(convert_to($1, 'UTF8')) and contact_email is not null`,
          [created.token],
        )
      ).rows[0].c,
      0,
    );

    await db.query(`
      create or replace function public.public_diary_share_enabled() returns boolean
      language sql immutable parallel safe set search_path = '' as $$ select false $$;
    `);
    await db.query(`
      create or replace function public.share_link_view_counts_enabled() returns boolean
      language sql immutable parallel safe set search_path = '' as $$ select false $$;
    `);
  });
});

describe('live I2 private schema RLS', () => {
  it('enables RLS without policies on private.test_accounts and leaves definer helpers working', async () => {
    const rls = (
      await db.query(`
        select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'private' and c.relname in ('blur_salt', 'test_accounts')
        order by 1`)
    ).rows;
    assert.deepEqual(
      rls.map((r) => [r.relname, r.rls, r.forced]),
      [['test_accounts', true, false]],
    );
    assert.equal((await run(smoke, 'select public.is_test_account() v')).rows[0].v, true);
    assert.equal((await db.query(`select to_regclass('private.blur_salt') is null as gone`)).rows[0].gone, true);
    assert.equal(
      (
        await db.query(`
          select count(*)::int n from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'blur_point_keyed'`)
      ).rows[0].n,
      0,
    );
  });
});

describe('reports.group_id index', () => {
  it('has a btree on public.reports(group_id)', async () => {
    const idx = (
      await db.query(`
        select indexname, indexdef from pg_indexes
         where schemaname = 'public' and tablename = 'reports' and indexname = 'reports_group_id_idx'`)
    ).rows[0];
    assert.ok(idx);
    assert.match(idx.indexdef, /group_id/);
  });
});
