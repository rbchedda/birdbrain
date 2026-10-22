import type { TileStore } from './store';

/** Web: no offline packs (the browser has its own HTTP cache; packs are a phone feature). */
export const fileTileStore: TileStore = {
  supported: false,
  download: () => Promise.reject(new Error('Offline maps are available in the iOS and Android app.')),
  exists: async () => false,
  size: async () => 0,
  readBase64: async () => null,
  remove: async () => {},
  readManifests: async () => ({}),
  writeManifests: async () => {},
};
