import { addDays, formatDay, type Ymd } from '@/lib/time';

import { stockingCountyOf, windowsForCounty } from './places';
import { speciesStatus } from './seasons';
import type { LngLat, Place, Species } from './types';

/**
 * Species search (designer spec birdbrain-polish/species-search, final Oct 23, 2026).
 * Pure ranking over places already on the device: no network, no hosted change.
 */
export type SearchBird = 'pheasant' | 'grouse' | 'woodcock' | 'dove' | 'turkey';

export interface BirdOption {
  key: SearchBird;
  label: string;
  /** Lower-case names and aliases matched by the search box. */
  aliases: string[];
}

export const searchBirds: BirdOption[] = [
  { key: 'pheasant', label: 'Pheasant', aliases: ['pheasant', 'ring-necked pheasant', 'ringneck', 'ringneck pheasant', 'rooster', 'ringnecked pheasant'] },
  { key: 'grouse', label: 'Ruffed grouse', aliases: ['ruffed grouse', 'grouse', 'partridge', 'pat', 'ruff'] },
  { key: 'woodcock', label: 'Woodcock', aliases: ['woodcock', 'american woodcock', 'timberdoodle', 'bogsucker'] },
  { key: 'dove', label: 'Mourning dove', aliases: ['mourning dove', 'dove', 'doves'] },
  { key: 'turkey', label: 'Fall turkey', aliases: ['fall turkey', 'turkey', 'wild turkey'] },
];

/** Terms we recognise as birds but don't cover yet (spec: future). */
const futureTerms = ['waterfowl', 'duck', 'ducks', 'goose', 'geese', 'canada goose', 'quail', 'bobwhite', 'snipe', 'wilson\'s snipe', 'spring gobbler', 'gobbler', 'crow', 'rail', 'gallinule'];

const clean = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

/** Bird suggestions for a query of ≥2 characters (names + aliases, prefix or word match). */
export function matchBirds(query: string): BirdOption[] {
  const q = clean(query);
  if (q.length < 2) return [];
  return searchBirds.filter((b) => b.aliases.some((a) => a.startsWith(q) || a.split(' ').some((w) => w.startsWith(q))));
}

/** Exact bird for a submitted query, or null. */
export function birdForQuery(query: string): BirdOption | null {
  const q = clean(query);
  return searchBirds.find((b) => b.aliases.includes(q)) ?? null;
}

/** A submitted term that names a bird we don't cover yet (shows "We don't cover [x] yet"). */
export const isUncoveredBird = (query: string) => {
  const q = clean(query);
  return q.length >= 2 && futureTerms.some((t) => t === q || t.startsWith(q + ' ') || q.startsWith(t));
};

// Fall turkey 2026-27 (digest PDF p.35): opens Oct 31 in every WMU but 5C/5D; the end varies by WMU
// (Nov 3 at the earliest, Nov 27 at the latest). Places carry no WMU yet, so after Nov 3 the
// status is "check your WMU" rather than a guessed date.
export const FALL_TURKEY_OPEN: Ymd = '2026-10-31';
export const FALL_TURKEY_FIRST_CLOSE: Ymd = '2026-11-03';
export const FALL_TURKEY_LAST_CLOSE: Ymd = '2026-11-27';

export type SeasonTag =
  | { kind: 'open'; label: string }
  | { kind: 'check'; label: string }
  | { kind: 'closed'; label: string };

/** Season tag for a bird today (statewide; fall turkey per spec above). */
export function seasonTag(bird: SearchBird, ymd: Ymd, at: LngLat): SeasonTag {
  if (bird === 'turkey') {
    if (ymd < FALL_TURKEY_OPEN) return { kind: 'closed', label: `Closed until ${formatDay(FALL_TURKEY_OPEN)}` };
    if (ymd <= FALL_TURKEY_FIRST_CLOSE) return { kind: 'open', label: 'Open (not WMU 5C/5D)' };
    if (ymd <= FALL_TURKEY_LAST_CLOSE) return { kind: 'check', label: 'Check your WMU' };
    return { kind: 'closed', label: 'Closed for the season' };
  }
  const s = speciesStatus(bird as Species, ymd, at);
  if (s.kind === 'open') {
    if (s.season.youth) return { kind: 'closed', label: 'Youth only today' };
    const end = s.season.windows?.find(([a, b]) => ymd >= a && ymd <= b)?.[1];
    return { kind: 'open', label: end ? `Open · closes ${formatDay(end)}` : 'Open' };
  }
  if (s.kind === 'sunday') return { kind: 'closed', label: 'Closed Sundays' };
  if (s.kind === 'check') return { kind: 'check', label: 'Check the digest' };
  return { kind: 'closed', label: s.nextOpen ? `Closed until ${formatDay(s.nextOpen.date)}` : 'Closed for the season' };
}

const MI_PER_KM = 0.621371;
const kmBetween = (a: LngLat, b: LngLat) => {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/** Habitat/stocking fit 0–1 plus the plain reason shown on the row. Null = not a spot for this bird. */
export function fitFor(bird: SearchBird, place: Place, today: Ymd): { fit: number; reason: string } | null {
  // Places that list species are managed for those; game lands list none and allow all.
  if (place.species.length && !place.species.includes(bird as Species)) return null;
  const big = Math.min(1, (place.acres ?? 0) / 5000);
  const acres = place.acres ? `${Math.round(place.acres).toLocaleString('en-US')} acres` : null;
  switch (bird) {
    case 'pheasant': {
      if (place.type !== 'stocking') return place.type === 'game_land' ? { fit: 0.2, reason: 'Game land, not on the stocking list' } : null;
      const weeks = windowsForCounty(stockingCountyOf(place));
      const from = addDays(today, -28);
      const recent = [0, 1, 2, 3].filter((i) => {
        const a = addDays(from, i * 7);
        const b = addDays(a, 6);
        return weeks.some((w) => w.windowStart <= b && w.windowEnd >= a);
      }).length;
      const upcoming = weeks.find((w) => w.windowStart > today);
      if (recent) return { fit: 0.6 + 0.1 * recent, reason: `Stocked ${recent} of last 4 weeks` };
      if (upcoming) return { fit: 0.6, reason: `Stocking week starts ${formatDay(upcoming.windowStart as Ymd)}` };
      return { fit: 0.4, reason: 'Pheasant stocking site' };
    }
    case 'dove':
      if (place.type === 'dove_field') return { fit: 1, reason: 'PGC-managed dove field' };
      if (place.type === 'game_land') return { fit: 0.3, reason: 'Game land, no managed dove field listed' };
      return null;
    case 'grouse':
    case 'woodcock':
    case 'turkey':
      if (place.type !== 'game_land') return null;
      return { fit: 0.4 + 0.5 * big, reason: acres ? `Game land, ${acres} of cover` : 'State game land' };
  }
}

/** Row note for enrolled private land (PGC Hunter Access). */
export const accessLabelShort = 'Private land · permission rules';

export interface SearchFilters {
  /** Hide spots whose season is closed today. Off = "Show closed". */
  openNow: boolean;
  publicOnly: boolean;
  radiusMi: 25 | 50 | 100;
}

export interface SpotResult {
  rank: number;
  place: Place;
  miles: number;
  score: number;
  reason: string;
  tag: SeasonTag;
  /** Shown for enrolled private land (Hunter Access): permission rules apply. */
  accessNote: string | null;
}

/** Distance decay 0–1: 1 at the origin, 0.5 at 15 mi. */
export const distanceDecay = (miles: number) => Math.pow(0.5, miles / 15);

export const MAX_RESULTS = 20;

/**
 * Rank spots for a bird: score = fit × 0.6 + distance decay × 0.4. Closed-season spots are
 * excluded when `openNow`; ties go to the nearer spot. Top 20.
 */
export function rankSpots(
  bird: SearchBird,
  places: Place[],
  origin: LngLat,
  filters: SearchFilters,
  today: Ymd,
): SpotResult[] {
  const rows: Omit<SpotResult, 'rank'>[] = [];
  for (const place of places) {
    if (filters.publicOnly && place.access === 'enrolled_private') continue;
    const miles = kmBetween(origin, place.center) * MI_PER_KM;
    if (miles > filters.radiusMi) continue;
    const fit = fitFor(bird, place, today);
    if (!fit) continue;
    const tag = seasonTag(bird, today, place.center);
    if (filters.openNow && tag.kind === 'closed') continue;
    rows.push({
      place,
      miles,
      score: fit.fit * 0.6 + distanceDecay(miles) * 0.4,
      reason: fit.reason,
      tag,
      accessNote: place.access === 'enrolled_private' ? accessLabelShort : null,
    });
  }
  rows.sort((a, b) => b.score - a.score || a.miles - b.miles || a.place.name.localeCompare(b.place.name));
  return rows.slice(0, MAX_RESULTS).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Why a search came back empty, for the no-results state. */
export function emptyReason(bird: SearchBird, today: Ymd, at: LngLat, filters: SearchFilters): 'season_closed' | 'none_in_radius' {
  return filters.openNow && seasonTag(bird, today, at).kind === 'closed' ? 'season_closed' : 'none_in_radius';
}

/** Default chips, in-season first. */
export function birdChips(today: Ymd, at: LngLat): BirdOption[] {
  const order = { open: 0, check: 1, closed: 2 } as const;
  return [...searchBirds].sort((a, b) => order[seasonTag(a.key, today, at).kind] - order[seasonTag(b.key, today, at).kind]);
}

/** Exact [[west, south], [east, north]] bounds of the origin plus the top 5 results. */
export function resultBounds(origin: LngLat, results: SpotResult[]): [[number, number], [number, number]] {
  const pts = [origin, ...results.slice(0, 5).map((r) => r.place.center)];
  const lngs = pts.map((p) => p.lng);
  const lats = pts.map((p) => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** Place id -> rank, for numbered pins. */
export const rankMap = (results: SpotResult[]) => Object.fromEntries(results.map((r) => [r.place.id, r.rank]));

export const formatMiles = (mi: number) => `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
