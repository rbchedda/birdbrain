/**
 * Storage the downloader writes through. The native implementation is
 * fileTileStore (expo-file-system); tests use an in-memory one.
 * Paths are relative to the packs root: <packId>/<source>/<z>/<x>/<y>.
 */
export interface TileStore {
  /** Download url to path; resolves the byte size written. Must reject on non-2xx. */
  download(url: string, path: string): Promise<number>;
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  /** File contents as base64, or null if missing. */
  readBase64(path: string): Promise<string | null>;
  remove(dir: string): Promise<void>;
  readManifests(): Promise<Record<string, import('./packs').PackManifest>>;
  writeManifests(m: Record<string, import('./packs').PackManifest>): Promise<void>;
  /** False where packs cannot be stored (web). */
  readonly supported: boolean;
}

export const tilePath = (packId: string, source: string, z: number, x: number, y: number) =>
  `${packId}/${source}/${z}/${x}/${y}`;
