/**
 * Client-side Storage cleanup. Hosted Supabase refuses SQL deletes on
 * storage.objects, so files are removed through the Storage API before the
 * rows that own them go away.
 */

/** The slice of a supabase-js storage bucket this needs (easy to mock). */
export interface StorageBucketApi {
  list(
    path: string,
    options: { limit: number; offset: number; sortBy?: { column: string; order: string } },
  ): Promise<{ data: { name: string; id: string | null }[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
}

export const LIST_PAGE = 100;
export const REMOVE_BATCH = 100;

/**
 * Every file path under prefix, recursively. Storage lists one level at a
 * time; folders come back with id null. Pages until a short page.
 */
export async function listAllFiles(bucket: StorageBucketApi, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const folders = [prefix.replace(/\/+$/, '')];
  while (folders.length) {
    const dir = folders.shift()!;
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await bucket.list(dir, { limit: LIST_PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw new Error(`Couldn’t list photos (${dir}): ${error.message}`);
      const items = data ?? [];
      for (const item of items) {
        const path = `${dir}/${item.name}`;
        // Placeholder objects keep empty folders alive; they are files too.
        if (item.id === null) folders.push(path);
        else files.push(path);
      }
      if (items.length < LIST_PAGE) break;
    }
  }
  return files;
}

/** Remove every file under prefix. Throws (having removed nothing more) on the first failed batch. */
export async function removeAllUnder(bucket: StorageBucketApi, prefix: string): Promise<number> {
  const files = await listAllFiles(bucket, prefix);
  for (let i = 0; i < files.length; i += REMOVE_BATCH) {
    const { error } = await bucket.remove(files.slice(i, i + REMOVE_BATCH));
    if (error) throw new Error(`Couldn’t delete photos: ${error.message}`);
  }
  return files.length;
}
