// Delete files queued in public.storage_deletion_queue through the Storage API.
//
//   DATABASE_URL=postgres://... SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... node ingest/storage_cleanup.mjs
//
// The DB never deletes storage objects itself (hosted Supabase refuses SQL
// deletes on storage.objects, and they would orphan the file anyway). Triggers
// such as delete_crew_content queue (bucket, path) rows; this job removes them in
// batches per bucket and deletes a queue row only after the API call succeeds.
// A failed batch bumps attempts and records last_error, and is retried on the next
// run. Rows that reach MAX_ATTEMPTS are left for a human and reported.
// Scheduled by .github/workflows/storage-cleanup.yml. Secrets come from the
// environment only.

import { pathToFileURL } from 'node:url';

export const BATCH_SIZE = 100; // Storage API remove() accepts up to 1000 prefixes
export const MAX_ATTEMPTS = 10;

/** Minimal Storage client: same shape as supabase-js `storage.from(b).remove(paths)`. */
export function storageClient({ url, serviceKey, fetchImpl = fetch }) {
  return {
    async remove(bucket, paths) {
      const res = await fetchImpl(`${url.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok) throw new Error(`storage ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res.json(); // objects actually deleted; paths already gone are simply absent
    },
  };
}

export async function runCleanup(db, storage, { batchSize = BATCH_SIZE, maxAttempts = MAX_ATTEMPTS, maxBatches = 50 } = {}) {
  const out = { deleted: 0, failed: 0, stuck: 0 };
  for (let i = 0; i < maxBatches; i++) {
    const { rows } = await db.query(
      `select id, bucket_id, path from public.storage_deletion_queue
        where attempts < $1 and (last_attempt_at is null or last_attempt_at < now() - interval '1 minute')
        order by id limit $2`,
      [maxAttempts, batchSize],
    );
    if (!rows.length) break;
    const byBucket = Map.groupBy(rows, (r) => r.bucket_id);
    for (const [bucket, items] of byBucket) {
      const ids = items.map((r) => r.id);
      try {
        await storage.remove(bucket, items.map((r) => r.path));
        await db.query('delete from public.storage_deletion_queue where id = any($1::bigint[])', [ids]);
        out.deleted += ids.length;
      } catch (err) {
        await db.query(
          `update public.storage_deletion_queue
              set attempts = attempts + 1, last_attempt_at = now(), last_error = left($2, 500)
            where id = any($1::bigint[])`,
          [ids, String(err?.message ?? err)],
        );
        out.failed += ids.length;
      }
    }
  }
  out.stuck = (await db.query('select count(*)::int n from public.storage_deletion_queue where attempts >= $1', [maxAttempts])).rows[0].n;
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Set DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await runCleanup(client, storageClient({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_ROLE_KEY }));
    console.log(JSON.stringify(result));
    if (result.failed || result.stuck) process.exitCode = 1; // surfaces in the Actions run
  } finally {
    await client.end();
  }
}
