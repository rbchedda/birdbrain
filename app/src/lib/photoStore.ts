/**
 * Web / test fallback: picked photos are blob or data URIs that live as long as
 * the page, so they're used as-is. Native copies them into app storage
 * (photoStore.native.ts).
 */
export async function keepPhoto(uri: string, _name: string): Promise<string> {
  return uri;
}

/** Resolve a stored local URI to one that exists now (native re-roots it after app updates). */
export function resolveLocalPhoto(uri: string | null | undefined): string | null {
  return uri ?? null;
}
