// Applies supabase/migrations/*.sql in order via the Management API query endpoint,
// one transaction per file, recording each in supabase_migrations.schema_migrations
// (CLI format). Skips already-recorded versions. Stops at first error. Never prints secrets.
import fs from 'node:fs'; import path from 'node:path';
const REF = process.env.SUPABASE_PROJECT_REF || 'ipvcrygkulrwopgtdkwd';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN; if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN missing');
export async function q(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 800)}`); return JSON.parse(t || '[]');
}
const lit = (s) => `'${s.replaceAll("'", "''")}'`;
if (import.meta.url === `file://${process.argv[1]}`) {
  await q(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;`);
  const done = new Set((await q('select version from supabase_migrations.schema_migrations')).map((r) => r.version));
  const dir = new URL('../supabase/migrations/', import.meta.url).pathname;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const [, version, name] = f.match(/^(\d+)_(.+)\.sql$/);
    if (done.has(version)) { console.log('skip', f); continue; }
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      await q(`begin;\n${sql}\n;insert into supabase_migrations.schema_migrations(version,name,statements) values (${lit(version)},${lit(name)},array[${lit(sql)}]);\ncommit;`);
      console.log('applied', f);
    } catch (e) { console.log('FAILED', f, e.message); process.exit(1); }
  }
}
