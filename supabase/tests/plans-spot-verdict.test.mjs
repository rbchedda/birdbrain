/**
 * PGlite: plans.show_spot_verdict_to_crew defaults false; spot_verdict_snapshot nullable.
 * Does not apply to hosted — migration file only.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migPath = join(root, 'supabase/migrations/20261105000100_plans_show_spot_verdict.sql');
const mig = readFileSync(migPath, 'utf8');

async function stubPlans(db) {
  await db.exec(`
    create schema if not exists public;
    create table if not exists public.plans (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      client_id text not null,
      place_id text,
      place_name text,
      plan_date date,
      species text[],
      notes text,
      reminder text,
      crew_id uuid
    );
  `);
}

test('migration file declares opt-in default false + snapshot; applies on PGlite', async () => {
  assert.match(mig, /add column if not exists show_spot_verdict_to_crew boolean not null default false/i);
  assert.match(mig, /add column if not exists spot_verdict_snapshot jsonb/i);
  assert.match(mig, /show_spot_verdict_to_crew/i);

  const db = new PGlite();
  await stubPlans(db);
  // Apply schema changes only (COMMENT strings contain semicolons; GRANT needs roles).
  await db.exec(`
    alter table public.plans
      add column if not exists show_spot_verdict_to_crew boolean not null default false;
    alter table public.plans
      add column if not exists spot_verdict_snapshot jsonb;
  `);

  const cols = await db.query(`
    select column_name, column_default, is_nullable, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'plans'
      and column_name in ('show_spot_verdict_to_crew', 'spot_verdict_snapshot')
    order by column_name
  `);
  const by = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
  assert.ok(by.show_spot_verdict_to_crew);
  assert.match(String(by.show_spot_verdict_to_crew.column_default), /false/);
  assert.equal(by.show_spot_verdict_to_crew.is_nullable, 'NO');
  assert.ok(by.spot_verdict_snapshot);
  assert.equal(by.spot_verdict_snapshot.is_nullable, 'YES');

  await db.query(
    `insert into public.plans (user_id, client_id) values ('00000000-0000-0000-0000-000000000001', 'c1')`,
  );
  const row = await db.query(
    `select show_spot_verdict_to_crew, spot_verdict_snapshot from public.plans where client_id = 'c1'`,
  );
  assert.equal(row.rows[0].show_spot_verdict_to_crew, false);
  assert.equal(row.rows[0].spot_verdict_snapshot, null);
});
