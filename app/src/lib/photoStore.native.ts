import { Directory, File, Paths } from 'expo-file-system';

/**
 * Picked photos are copied out of the picker's cache into
 * <documents>/photos/ so an entry saved offline still has its photo when it
 * finally syncs (the cache can be purged). Bytes are copied unchanged.
 */
const DIR = 'photos';
const root = () => new Directory(Paths.document, DIR);

export async function keepPhoto(uri: string, name: string): Promise<string> {
  try {
    const dir = root();
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, name);
    if (dest.exists) dest.delete();
    new File(uri).copy(dest);
    return dest.uri;
  } catch {
    // Fall back to the picker's own file; it still uploads while the cache lasts.
    return uri;
  }
}

/**
 * The iOS app container path changes across updates, so a stored
 * file://…/Documents/photos/<name> URI is re-rooted onto today's documents dir.
 */
export function resolveLocalPhoto(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const marker = `/${DIR}/`;
  const at = uri.lastIndexOf(marker);
  if (at < 0) return uri;
  try {
    const f = new File(root(), uri.slice(at + marker.length));
    return f.exists ? f.uri : uri;
  } catch {
    return uri;
  }
}
