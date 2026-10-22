import { useEffect, useMemo, useState } from 'react';

import { PackDownloader } from './downloader';
import { fileTileStore } from './fileTileStore';
import type { PackManifest } from './packs';
import { serveTile as serveTileFrom } from './tileServer';

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

/** Map prop for downloaded packs; undefined when there are none or the pass is not active. */
export function useOfflineMapSource(allowed: boolean) {
  const manifests = useOfflinePacks();
  return useMemo(() => {
    if (!allowed || !offlineSupported) return undefined;
    const basemaps = [...new Set(Object.values(manifests).filter((m) => m.done > 0).flatMap((m) => m.spec.basemaps))];
    if (!basemaps.length) return undefined;
    return { basemaps, getTile: (url: string) => serveTileFrom(url, manifests, fileTileStore) };
  }, [allowed, manifests]);
}
