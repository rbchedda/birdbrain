import { colors } from '@/theme/tokens';
import type { GeoJSONGeometry, LngLat, Place, PlaceType } from '@/data/types';

export type Basemap = 'topo' | 'satellite' | 'terrain';

/**
 * Brand terrain basemap (basemap PR 2). On by default (French Creek tiles ship in the bundle); EXPO_PUBLIC_FLAG_TERRAIN_BASEMAP=0 turns it off. While off the
 * Terrain option is hidden and the map page treats 'terrain' as topo.
 */
export const terrainBasemapEnabled = process.env.EXPO_PUBLIC_FLAG_TERRAIN_BASEMAP !== '0';

export const basemapOptions: { key: Basemap; label: string; icon: 'map-outline' | 'earth-outline' | 'trail-sign-outline' }[] = [
  { key: 'topo', label: 'Standard', icon: 'map-outline' },
  { key: 'satellite', label: 'Satellite', icon: 'earth-outline' },
  { key: 'terrain', label: 'Terrain', icon: 'trail-sign-outline' },
];

export const visibleBasemaps = (terrain = terrainBasemapEnabled) => basemapOptions.filter((o) => terrain || o.key !== 'terrain');

/**
 * Contract for the map. Today it's MapLibre GL JS in a WebView (native) or an
 * iframe (web), which runs in Expo Go. A MapLibre Native dev build can drop in
 * as PlaceMap.native.tsx with the same props.
 */
export interface PlaceMapProps {
  places: Place[];
  selectedId?: string;
  /** Boundary of the selected place, when loaded. */
  outline?: GeoJSONGeometry | null;
  basemap: Basemap;
  /** Bump to recenter on the selected place (e.g. picked from the list). */
  focus?: { center: LngLat; key: number; zoom?: number };
  onSelect: (id: string | null) => void;
  /** The user's position (blue dot + accuracy circle); null hides it. */
  me?: { lng: number; lat: number; accuracy: number | null } | null;
  /**
   * Downloaded packs (premium). Basemaps listed here are drawn from bboffline://
   * tiles answered by getTile (base64, or null to fall back to the network).
   * Safety overlays never depend on this.
   */
  offline?: { basemaps: Basemap[]; getTile: (url: string) => Promise<string | null> };
  /** Tap on a bundled state park outline (pins win when both are hit). */
  onSelectPark?: (id: string) => void;
  /** Tap on the map that hit no pin or boundary (drags/pans never fire it). Defaults to onSelect(null). */
  onEmptyTap?: () => void;
  /** Species search: place id -> rank (1-based). Ranks 1-10 draw as numbered pins. */
  ranks?: Record<string, number>;
  /** Bump to fit the camera to these bounds exactly ([[west, south], [east, north]]). */
  fit?: { bounds: [[number, number], [number, number]]; key: number };
  /** Map center after each pan/zoom. */
  onCenterChange?: (center: LngLat) => void;
}

export const pinColor: Record<PlaceType, string> = {
  game_land: colors.text,
  stocking: colors.accent,
  dove_field: colors.dove,
};
