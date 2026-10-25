import type { JournalEntry } from './journal';
import type { PlaceLookup } from './stats';
import { emptyDiaryDetails, type Dog, type DiaryDog, type Species } from './types';

/**
 * SAMPLE DATA for the Stats preview (Profile › Stats › "Preview with sample
 * data"). Invented and deterministic: 30 days, 118 flushes, 96 hours, 9 game
 * lands in the 2025–26 season, plus a smaller 2024–25. Never written to the
 * journal, never uploaded, and always labelled SAMPLE DATA on screen.
 */

export const SAMPLE_SEASON = '2025-26';
/** The sample's "today": the season is closed, so it reads as a full year. */
export const SAMPLE_TODAY = '2026-03-05';
/** A moment after the sample season's last day: the share delay has passed for every sample hunt. */
export const SAMPLE_NOW = new Date('2026-03-06T17:00:00Z');

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLACES = [
  { id: 'sx-211', name: 'SGL 211 · Stony Creek', county: 'Centre', days: 9 },
  { id: 'sx-176', name: 'SGL 176 · Scotia Barrens', county: 'Huntingdon', days: 7 },
  { id: 'sx-33', name: 'SGL 33 · Bald Eagle', county: 'Centre', days: 5 },
  { id: 'sx-101', name: 'SGL 101', county: 'Blair', days: 3 },
  { id: 'sx-295', name: 'SGL 295', county: 'Mifflin', days: 2 },
  { id: 'sx-12', name: 'SGL 12', county: 'Blair', days: 1 },
  { id: 'sx-54', name: 'SGL 54', county: 'Clearfield', days: 1 },
  { id: 'sx-58', name: 'SGL 58', county: 'Clearfield', days: 1 },
  { id: 'sx-77', name: 'SGL 77', county: 'Juniata', days: 1 },
];

export const sampleRoster: Dog[] = [
  { id: 'sx-ruby', name: 'Ruby', breed: 'Brittany' },
  { id: 'sx-scout', name: 'Scout', breed: 'English setter' },
];

export const sampleLookup: PlaceLookup = (id) => {
  const p = PLACES.find((x) => x.id === id);
  return p ? { type: 'game_land', county: p.county, center: { lng: -77.8, lat: 40.8 } } : undefined;
};

const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

const WEEKDAY_PENALTY = 0.3;
function pickDays(r: () => number, ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const days = Array.from({ length: daysIn(ym) }, (_, i) => i + 1)
    .map((d) => {
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      return { d, k: r() + (dow === 0 || dow === 6 ? 0 : WEEKDAY_PENALTY) };
    })
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((x) => x.d)
    .sort((a, b) => a - b);
  return days.map((d) => `${ym}-${String(d).padStart(2, '0')}`);
}

/** Split `total` across `n` slots, each at least `min`, deterministically. */
function split(r: () => number, total: number, n: number, min = 0) {
  const out = Array.from({ length: n }, () => min);
  for (let left = total - min * n; left > 0; left--) out[Math.floor(r() * n)]++;
  return out;
}

let seq = 0;
function make(ymd: string, placeIdx: number, sp: Species[], fl: number, hours: number | null, dogs: DiaryDog[], r: () => number): JournalEntry {
  const place = PLACES[placeIdx];
  seq++;
  const withDetails = hours !== null || dogs.length > 0 || sp.length > 0;
  return {
    id: `sample-${seq}`,
    clientId: `sample-${seq}`,
    author: { id: 'me', username: null, displayName: 'You' },
    mine: true,
    kind: 'hunt',
    species: sp[0] ?? null,
    caption: '',
    createdAt: `${ymd}T23:30:00Z`,
    publicAfter: null,
    huntedOn: ymd,
    location: 'hidden',
    area: null,
    counts: null,
    placeCounts: [{ placeId: place.id, placeName: place.name, flushed: 0, roosters: 0, harvested: 0 }],
    likes: 0,
    comments: 0,
    likedByMe: false,
    group: null,
    sync: { status: 'synced', version: 1, rev: 0, attempts: 0, nextAttemptAt: 0, error: null, conflict: false },
    details: withDetails
      ? {
          ...emptyDiaryDetails(),
          species: sp,
          dogs,
          flushes: fl,
          hours,
          miles: hours === null ? null : Math.round(hours * (1.2 + r() * 1.2) * 10) / 10,
          weather: hours === null ? null : { tempF: 28 + Math.floor(r() * 30), windMph: 2 + Math.floor(r() * 12), windDir: 'NW', sky: null, precip: null },
        }
      : { ...emptyDiaryDetails(), flushes: fl },
  };
}

function shuffle<T>(r: () => number, xs: T[]) {
  return xs
    .map((x) => ({ x, k: r() }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.x);
}

export function sampleEntries(): JournalEntry[] {
  seq = 0;
  const r = rng(7);
  const cur = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'].flatMap((ym, i) => pickDays(r, ym, [3, 7, 9, 6, 4, 1][i]));
  const placeFor = shuffle(r, PLACES.flatMap((p, i) => Array.from({ length: p.days }, () => i)));
  // 14 grouse/woodcock days, 11 pheasant, 6 dove, 3 turkey, 2 waterfowl: 28 days with a bird, 2 without
  // (a day can carry more than one bird).
  const tags: Species[][] = shuffle(r, [
    ...Array.from({ length: 9 }, () => ['grouse'] as Species[]),
    ['grouse', 'woodcock'], ['grouse', 'woodcock'],
    ['woodcock'], ['woodcock'], ['woodcock'],
    ...Array.from({ length: 3 }, () => ['pheasant'] as Species[]),
    ...Array.from({ length: 4 }, () => ['pheasant', 'dove'] as Species[]),
    ['pheasant', 'waterfowl'], ['pheasant', 'waterfowl'],
    ['pheasant', 'turkey'], ['pheasant', 'turkey'],
    ['dove'], ['dove'], ['turkey'], [], [],
  ]);
  const withHours = new Set(shuffle(r, cur.map((_, i) => i)).slice(0, 22));
  const hrs = split(r, 960, 22, 20).map((x) => x / 10);
  const flushHours = split(r, 110, 22, 1);
  let fh = 0;
  const ruby = new Set(shuffle(r, [...withHours]).slice(0, 22));
  const scout = new Set(shuffle(r, [...ruby]).slice(0, 11));
  const rubyPts = split(r, 31, 22), rubyFl = split(r, 40, 22), rubyRt = split(r, 9, 22);
  const scoutPts = split(r, 12, 11), scoutFl = split(r, 18, 11), scoutRt = split(r, 3, 11);
  let h = 0, ri = 0, si = 0;
  const out = cur.map((ymd, i) => {
    const dogs: DiaryDog[] = [];
    if (ruby.has(i)) { dogs.push({ dogId: 'sx-ruby', name: 'Ruby', points: rubyPts[ri], flushes: rubyFl[ri], retrieves: rubyRt[ri] }); ri++; }
    if (scout.has(i)) { dogs.push({ dogId: 'sx-scout', name: 'Scout', points: scoutPts[si], flushes: scoutFl[si], retrieves: scoutRt[si] }); si++; }
    return make(ymd, placeFor[i], tags[i], withHours.has(i) ? flushHours[fh++] : 1, withHours.has(i) ? hrs[h++] : null, dogs, r);
  });
  // Last season: 24 days, Ruby only; every game land except SGL 101 and 295.
  const prev = ['2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02'].flatMap((ym, i) => pickDays(r, ym, [2, 6, 7, 5, 3, 1][i]));
  const prevPlaces = [0, 1, 2, 5, 6, 7, 8];
  for (const [i, ymd] of prev.entries()) {
    const hours = Math.round((3 + r() * 3) * 10) / 10;
    out.push(make(ymd, i < prevPlaces.length ? prevPlaces[i] : prevPlaces[Math.floor(r() * 3)], [r() < 0.5 ? 'grouse' : 'pheasant'], 2 + Math.floor(r() * 5), hours, [{ dogId: 'sx-ruby', name: 'Ruby', points: 1, flushes: 1, retrieves: 0 }], r));
  }
  return out;
}
