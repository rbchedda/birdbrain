// Run the repo's ingest (ingest/arcgis.mjs + ingest/stocking_windows.mjs) against hosted
// Supabase. Prefer DATABASE_URL as the ingest_writer pooler role (parameterised
// queries, least privilege; see supabase/migrations/20261109004000_ingest_writer.sql).
// When Postgres ports are blocked, a Management API adapter inlines params as SQL
// literals and sends them through the query endpoint. Use a scoped, expiring
// SUPABASE_ACCESS_TOKEN for that fallback only (I8; quote-doubling assumes
// standard_conforming_strings = on). Never prints secrets.
//   DATABASE_URL=postgres://ingest_writer... node scripts/hosted-ingest.mjs [--force]
import { readFileSync } from 'node:fs';
import { SOURCES, ingestCounties, ingestSource, pgClientConfig } from '../ingest/arcgis.mjs';
import { loadSeed } from '../ingest/stocking_windows.mjs';

const pgArray = (a) => `{${a.map((v) => (v == null ? 'NULL' : `"${String(v).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)).join(',')}}`;
export const literal = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('non-finite param'); return String(v); }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) v = v.toISOString();
  if (Array.isArray(v)) v = pgArray(v);
  if (typeof v === 'object') v = JSON.stringify(v);
  return `'${String(v).replaceAll("'", "''")}'`;
};
export const inline = (text, params = []) => text.replace(/\$(\d+)/g, (_, n) => {
  if (Number(n) > params.length) throw new Error(`missing param $${n}`); return literal(params[Number(n) - 1]);
});
const CHUNK = 3_000_000;
export function managementDb(run) {
  if (typeof run !== 'function') throw new Error('managementDb requires a query function');
  let buf = null;
  return {
    async query(text, params) {
      const t = text.trim().toLowerCase();
      if (t === 'begin') { buf = []; return { rows: [], rowCount: 0 }; }
      if (t === 'rollback') { buf = null; return { rows: [], rowCount: 0 }; }
      if (t === 'commit') {
        const stmts = buf; buf = null;
        const total = stmts.reduce((s, x) => s + x.length, 0);
        if (total <= CHUNK) { await run(`begin;\n${stmts.join(';\n')};\ncommit;`); return { rows: [], rowCount: 0 }; }
        const upserts = stmts.filter((s) => /^\s*(with src as|insert into public\.(places|counties|stocking_events|stocking_properties))/i.test(s));
        const rest = stmts.filter((s) => !upserts.includes(s));
        let chunk = [], size = 0;
        for (const s of upserts) {
          if (size + s.length > CHUNK && chunk.length) { await run(`begin;\n${chunk.join(';\n')};\ncommit;`); chunk = []; size = 0; }
          chunk.push(s); size += s.length;
        }
        if (chunk.length) await run(`begin;\n${chunk.join(';\n')};\ncommit;`);
        await run(`begin;\n${rest.join(';\n')};\ncommit;`);
        return { rows: [], rowCount: 0 };
      }
      const sql = inline(text, params);
      if (buf) { buf.push(sql); return { rows: [{ n: null }], rowCount: null }; }
      const rows = await run(sql); return { rows, rowCount: rows.length };
    },
  };
}
async function openDb() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const client = new pg.Client(pgClientConfig(process.env.DATABASE_URL));
    await client.connect();
    return { db: client, close: () => client.end() };
  }
  console.warn('DATABASE_URL unset; falling back to the Management API. Prefer a pooler URL as ingest_writer.');
  const { q } = await import('./hosted-apply-migrations.mjs');
  return { db: managementDb(q), close: () => {} };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db, close } = await openDb();
  const force = process.argv.includes('--force');
  try {
    console.log(JSON.stringify(await ingestCounties(db, { force })));
    for (const n of Object.keys(SOURCES)) console.log(JSON.stringify(await ingestSource(db, SOURCES[n], { force })));
    const seed = JSON.parse(readFileSync(new URL('../data/pgc/pheasant-allocation-2026-27.json', import.meta.url), 'utf8'));
    console.log(JSON.stringify(await loadSeed(db, seed)));
  } finally {
    await close();
  }
}
