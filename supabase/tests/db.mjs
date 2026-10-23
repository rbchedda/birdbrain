import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { postgis } from '@electric-sql/pglite-postgis';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

/** Fresh in-memory database with the Supabase stub and every migration applied. */
export async function createTestDb() {
  const db = await PGlite.create({ extensions: { postgis, pgcrypto } });
  await db.exec(readFileSync(join(here, 'supabase-stub.sql'), 'utf8'));
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  return db;
}

/** Run fn inside a transaction as the given role and (optional) user id. */
export function as(db, role, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(userId ? { sub: userId, role } : { role }),
    ]);
    return fn(tx);
  });
}

export async function createUser(db, id, email) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
}
