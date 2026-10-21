import { colors } from '@/theme/tokens';
import type { GeoJSONGeometry, LngLat, Place, PlaceType } from '@/data/types';

export type Basemap = 'topo' | 'imagery';

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
  focus?: { center: LngLat; key: number };
  onSelect: (id: string | null) => void;
}

export const pinColor: Record<PlaceType, string> = {
  game_land: colors.text,
  stocking: colors.accent,
  dove_field: colors.dove,
};
