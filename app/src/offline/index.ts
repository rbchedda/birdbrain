import { useEffect, useState } from 'react';

import { PackDownloader } from './downloader';
import { fileTileStore } from './fileTileStore';
import type { PackManifest } from './packs';

export * from './downloader';
export * from './packs';
export * from './safetyCache';
export * from './sources';
export { serveTile } from './tileServer';

/** The app's single downloader over device storage. */
export const offlinePacks = new PackDownloader(fileTileStore);
export const offlineSupported = fileTileStore.supported;

export function useOfflinePacks(): Record<string, PackManifest> {
  const [m, setM] = useState(offlinePacks.list());
  useEffect(() => {
    void offlinePacks.load();
    return offlinePacks.subscribe(setM);
  }, []);
  return m;
}
