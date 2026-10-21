export type Species = 'pheasant' | 'dove' | 'turkey' | 'grouse' | 'waterfowl';

export type PlaceType = 'game_land' | 'stocking' | 'dove_field';

export interface LngLat {
  lng: number;
  lat: number;
}

/** A row of public.places, reduced to what the app shows. */
export interface Place {
  id: string;
  name: string;
  type: PlaceType;
  county: string | null;
  /** Empty for game lands, which are open to every species in season. */
  species: Species[];
  /** Point on the surface (places.centroid). Pins only; outlines load on demand. */
  center: LngLat;
  acres: number | null;
  note?: string;
}

/** A row of public.stocking_events. */
export interface StockingEvent {
  id: string;
  placeId: string;
  windowStart: string;
  windowEnd: string;
  counts: Record<string, number>;
}

export interface PlaceDetail {
  stocking: StockingEvent[];
  /** GeoJSON geometry of the place boundary, when available. */
  outline: GeoJSONGeometry | null;
}

export type GeoJSONGeometry = { type: string; coordinates?: unknown; geometries?: GeoJSONGeometry[] };

export interface BirdCounts {
  flushed: number;
  roosters: number;
  harvested: number;
}

/** One place's line in a hunt log. Owner-only on the server (post_place_counts). */
export interface PlaceCount extends BirdCounts {
  placeId: string | null;
  placeName: string;
}

export interface Author {
  id: string;
  username: string | null;
  displayName: string | null;
}

export type LocationVisibility = 'hidden' | 'blurred';

/**
 * private: kept on this device only, never uploaded.
 * delayed: posted, but others can't see it until midnight ET (posts.public_after).
 * public:  visible to signed-in users who haven't blocked or been blocked by the author.
 */
export type Visibility = 'private' | 'delayed' | 'public';

export interface Post {
  id: string;
  author: Author;
  mine: boolean;
  kind: 'hunt' | 'harvest';
  species: Species | null;
  caption: string;
  createdAt: string;
  /** When others can first see the post. Null for private entries. */
  publicAfter: string | null;
  huntedOn: string | null;
  location: LocationVisibility;
  /** Blurred ~5 km grid cell center (posts.blurred_geom). Never the exact spot. */
  area: LngLat | null;
  counts: BirdCounts | null;
  /** Per-place breakdown. Only ever present on the author's own posts. */
  placeCounts?: PlaceCount[];
  likes: number;
  comments: number;
  likedByMe: boolean;
  group: string | null;
  photoTint?: string;
}

export interface PostDraft {
  species: Species | null;
  caption: string;
  huntedOn: string;
  counts: PlaceCount[];
  /** Exact point for post_locations (owner-only); the server publishes only the blurred cell. */
  exact: LngLat | null;
  location: LocationVisibility;
  audience: 'private' | 'shared';
  groupSlug: string | null;
}

export interface Comment {
  id: string;
  postId: string;
  author: Author;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface Profile {
  id: string;
  username: string | null;
  displayName: string | null;
  hasDog: boolean;
}

export interface Group {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  species: Species | null;
  member: boolean;
}

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'graphic'
  | 'illegal_activity'
  | 'live_game_alert'
  | 'location_exposed'
  | 'other';

export type ReportTarget = { kind: 'post' | 'comment' | 'profile'; id: string };

export const reportReasons: { key: ReportReason; label: string }[] = [
  { key: 'live_game_alert', label: 'Real-time game alert' },
  { key: 'location_exposed', label: 'Exposes a private location' },
  { key: 'harassment', label: 'Harassment' },
  { key: 'illegal_activity', label: 'Illegal activity' },
  { key: 'graphic', label: 'Graphic content' },
  { key: 'spam', label: 'Spam' },
  { key: 'other', label: 'Something else' },
];

export const speciesLabel: Record<Species, string> = {
  pheasant: 'Pheasant',
  dove: 'Dove',
  turkey: 'Turkey',
  grouse: 'Grouse',
  waterfowl: 'Waterfowl',
};

export const allSpecies = Object.keys(speciesLabel) as Species[];

export const migratory: Species[] = ['dove', 'waterfowl'];

export const placeTypeLabel: Record<PlaceType, string> = {
  game_land: 'State Game Lands',
  stocking: 'Pheasant Stocking',
  dove_field: 'Managed Dove Field',
};

export const displayName = (a: Pick<Author, 'displayName' | 'username'>) =>
  a.displayName || (a.username ? `@${a.username}` : 'Hunter');

export function initials(a: Pick<Author, 'displayName' | 'username'>) {
  const name = displayName(a).replace('@', '');
  const words = name.split(/[\s_.]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}
