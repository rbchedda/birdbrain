// Run the repo's ingest (ingest/arcgis.mjs + ingest/stocking_windows.mjs) against hosted
// Supabase when Postgres ports are blocked: a db adapter with query(text, params) that
// inlines params as SQL literals and sends them through the Management API query endpoint.
// Statements between begin/commit are buffered and sent as one transaction on commit; if the
// batch is too big, the idempotent upserts go in chunks first and the deletes/state in a final
// transaction. Re-runnable: everything is upsert + delete-missing. Never prints secrets.
//   node scripts/hosted-ingest.mjs [--force]
import { readFileSync } from 'node:fs';
import { q } from './hosted-apply-migrations.mjs';
import { SOURCES, ingestCounties, ingestSource } from '../ingest/arcgis.mjs';
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
export function managementDb(run = q) {
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
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = managementDb(); const force = process.argv.includes('--force');
  console.log(JSON.stringify(await ingestCounties(db, { force })));
  for (const n of Object.keys(SOURCES)) console.log(JSON.stringify(await ingestSource(db, SOURCES[n], { force })));
  const seed = JSON.parse(readFileSync(new URL('../data/pgc/pheasant-allocation-2026-27.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(await loadSeed(db, seed)));
}
