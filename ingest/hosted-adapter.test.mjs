import test from 'node:test'; import assert from 'node:assert/strict';
process.env.SUPABASE_ACCESS_TOKEN ||= 'test-only';
const { inline, literal, managementDb } = await import('../scripts/hosted-ingest.mjs');
test('literal escapes and formats', () => {
  assert.equal(literal("O'Brien"), "'O''Brien'");
  assert.equal(literal(null), 'NULL'); assert.equal(literal(3.5), '3.5'); assert.equal(literal(true), 'true');
  assert.equal(literal(['a', 'b"c']), `'{"a","b\\"c"}'`);
});
test('inline replaces $10 before $1 correctly', () => {
  const p = Array.from({ length: 10 }, (_, i) => i + 1);
  assert.equal(inline('$1,$10', p), '1,10');
  assert.throws(() => inline('$2', [1]));
});
test('statements between begin/commit go in one transaction', async () => {
  const sent = []; const db = managementDb(async (s) => { sent.push(s); return [{ x: 1 }]; });
  assert.deepEqual((await db.query('select $1 x', [1])).rows, [{ x: 1 }]);
  await db.query('begin'); await db.query('insert into t values ($1)', ['a']); await db.query('delete from t'); await db.query('commit');
  assert.equal(sent.length, 2); assert.match(sent[1], /^begin;\ninsert into t values \('a'\);\ndelete from t;\ncommit;$/);
  await db.query('begin'); await db.query('insert into t values (1)'); await db.query('rollback');
  assert.equal(sent.length, 2);
});
