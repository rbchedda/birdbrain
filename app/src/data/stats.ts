import { etWallTime, officialDay } from '@/lib/sun';
import { addDays, type Ymd } from '@/lib/time';

import type { JournalEntry } from './journal';
import { seasons } from './seasons';
import type { Dog, Place, Species } from './types';

/**
 * Private profile stats from the hunt log. Effort and variety only: nothing
 * here ranks or totals birds killed, and the recap hides bird totals.
 */

/** PA seasons run Jul 1 – Jun 30: '2026-27'. */
export function seasonOf(ymd: Ymd): string {
  const y = Number(ymd.slice(0, 4));
  const start = Number(ymd.slice(5, 7)) >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
export const seasonLabel = (season: string) => `${season.slice(0, 4)}–${season.slice(5)}`;

export type PlaceLookup = (id: string | null) => Pick<Place, 'type' | 'county' | 'center'> | undefined;

const SGL = /\bSGL\s*#?\s*(\d+)\b|\bState Game Lands?\s*#?\s*(\d+)\b/i;
/** "SGL 211" for a game land entry, from the picked place or the typed name. */
export function gameLandOf(e: JournalEntry, lookup: PlaceLookup = () => undefined): string | null {
  for (const c of e.placeCounts ?? []) {
    const m = SGL.exec(c.placeName);
    if (m) return `SGL ${m[1] ?? m[2]}`;
    if (lookup(c.placeId)?.type === 'game_land') return c.placeName;
  }
  return null;
}
const placeOf = (e: JournalEntry) => e.placeCounts?.[0]?.placeName?.trim() || null;
const countiesOf = (e: JournalEntry, lookup: PlaceLookup) =>
  (e.placeCounts ?? []).map((c) => lookup(c.placeId)?.county).filter((c): c is string => Boolean(c));
const speciesOf = (e: JournalEntry): Species[] => [...new Set([...(e.details?.species ?? []), ...(e.species ? [e.species] : [])])];
const flushesOf = (e: JournalEntry) =>
  e.details ? e.details.flushes : (e.placeCounts ?? []).reduce((t, c) => t + c.flushed, 0);
const birdsInHand = (e: JournalEntry) =>
  e.details ? e.details.birds.reduce((t, b) => t + b.count, 0) : (e.placeCounts ?? []).reduce((t, c) => t + c.harvested, 0);
const dated = (entries: JournalEntry[]) => entries.filter((e): e is JournalEntry & { huntedOn: string } => Boolean(e.huntedOn));

export interface MonthStats {
  month: string; // 'YYYY-MM'
  days: number;
  flushes: number;
  shots: number;
  points: number;
}

export interface SeasonStats {
  season: string;
  daysAfield: number;
  hunts: number;
  flushes: number;
  shots: number;
  hours: number;
  miles: number;
  dogPoints: number;
  dogRetrieves: number;
  gameLands: number;
  counties: number;
  places: number;
  byMonth: MonthStats[];
  /** Days afield per ISO-ish week from Sep 1, for the season heat strip (26 weeks). */
  heat: number[];
}

export function seasonStats(all: JournalEntry[], season: string, lookup: PlaceLookup = () => undefined): SeasonStats {
  const entries = dated(all).filter((e) => seasonOf(e.huntedOn) === season);
  const days = new Set(entries.map((e) => e.huntedOn));
  const sum = (f: (e: JournalEntry) => number) => entries.reduce((t, e) => t + f(e), 0);
  const months = new Map<string, MonthStats & { daySet: Set<string> }>();
  for (const e of entries) {
    const k = e.huntedOn.slice(0, 7);
    const m = months.get(k) ?? { month: k, days: 0, flushes: 0, shots: 0, points: 0, daySet: new Set<string>() };
    m.daySet.add(e.huntedOn);
    m.flushes += flushesOf(e);
    m.shots += e.details?.shots ?? 0;
    m.points += (e.details?.dogs ?? []).reduce((t, d) => t + d.points, 0);
    months.set(k, m);
  }
  const start = `${season.slice(0, 4)}-09-01`;
  const heat = Array.from({ length: 26 }, () => 0);
  for (const d of days) {
    const w = Math.floor((Date.parse(d) - Date.parse(start)) / (7 * 86_400_000));
    if (w >= 0 && w < heat.length) heat[w]++;
  }
  return {
    season,
    daysAfield: days.size,
    hunts: entries.length,
    flushes: sum(flushesOf),
    shots: sum((e) => e.details?.shots ?? 0),
    hours: sum((e) => e.details?.hours ?? 0),
    miles: sum((e) => e.details?.miles ?? 0),
    dogPoints: sum((e) => (e.details?.dogs ?? []).reduce((t, d) => t + d.points, 0)),
    dogRetrieves: sum((e) => (e.details?.dogs ?? []).reduce((t, d) => t + d.retrieves, 0)),
    gameLands: new Set(entries.map((e) => gameLandOf(e, lookup)).filter(Boolean)).size,
    counties: new Set(entries.flatMap((e) => countiesOf(e, lookup))).size,
    places: new Set(entries.map(placeOf).filter(Boolean)).size,
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map(({ daySet, ...m }) => ({ ...m, days: daySet.size })),
    heat,
  };
}

export interface LifeListItem {
  key: string;
  label: string;
  kind: 'species' | 'game_land';
  first: Ymd;
  /** First logged in the given season. */
  isNew: boolean;
}

/** Species hunted and SGLs hunted, with first dates. */
export function lifeList(all: JournalEntry[], season: string, lookup: PlaceLookup = () => undefined): LifeListItem[] {
  const first = new Map<string, LifeListItem>();
  for (const e of [...dated(all)].sort((a, b) => a.huntedOn.localeCompare(b.huntedOn))) {
    for (const s of speciesOf(e)) {
      if (!first.has(`s:${s}`)) first.set(`s:${s}`, { key: `s:${s}`, label: s, kind: 'species', first: e.huntedOn, isNew: false });
    }
    const gl = gameLandOf(e, lookup);
    if (gl && !first.has(`g:${gl}`)) first.set(`g:${gl}`, { key: `g:${gl}`, label: gl, kind: 'game_land', first: e.huntedOn, isNew: false });
  }
  return [...first.values()].map((i) => ({ ...i, isNew: seasonOf(i.first) === season }));
}

export interface DogStats {
  dogId: string;
  name: string;
  hunts: number;
  points: number;
  flushes: number;
  retrieves: number;
  miles: number;
}

export function dogStats(all: JournalEntry[], roster: Dog[] = []): DogStats[] {
  const by = new Map<string, DogStats>(roster.map((d) => [d.id, { dogId: d.id, name: d.name, hunts: 0, points: 0, flushes: 0, retrieves: 0, miles: 0 }]));
  for (const e of all) {
    for (const d of e.details?.dogs ?? []) {
      const s = by.get(d.dogId) ?? { dogId: d.dogId, name: d.name, hunts: 0, points: 0, flushes: 0, retrieves: 0, miles: 0 };
      s.hunts++;
      s.points += d.points;
      s.flushes += d.flushes;
      s.retrieves += d.retrieves;
      s.miles += e.details?.miles ?? 0;
      by.set(d.dogId, s);
    }
  }
  return [...by.values()];
}

export interface Badge {
  id: string;
  name: string;
  rule: string;
  earned: boolean;
  /** e.g. "7/10" while in progress; null when not tracked yet. */
  progress: string | null;
  tracked: boolean;
}

const DEFAULT_LNG = -77.6; // central PA, for legal light when the place has no point

/**
 * Marketing's badge list (effort, variety, days afield, places, learning).
 * No harvest trophies: no limits, doubles or shots-to-birds ratios.
 */
export function badges(all: JournalEntry[], season: string, lookup: PlaceLookup = () => undefined): Badge[] {
  const entries = dated(all);
  const inSeason = entries.filter((e) => seasonOf(e.huntedOn) === season);
  const st = seasonStats(all, season, lookup);
  const prog = (n: number, goal: number) => ({ earned: n >= goal, progress: `${Math.min(n, goal)}/${goal}`, tracked: true });

  const dawn = inSeason.filter((e) => {
    const t = e.details?.startTime;
    if (!t) return false;
    const lng = lookup(e.placeCounts?.[0]?.placeId ?? null)?.center.lng ?? DEFAULT_LNG;
    const day = officialDay(e.huntedOn, lng);
    if (!day) return false;
    const start = etWallTime(e.huntedOn, t);
    return Math.abs(start.getTime() - day.huntStart.getTime()) <= 30 * 60_000;
  }).length;
  const coldDays = new Set(inSeason.filter((e) => (e.details?.weather?.tempF ?? Infinity) < 20).map((e) => e.huntedOn)).size;

  const days = new Set(inSeason.map((e) => e.huntedOn));
  const openerToCloser = seasons.some((s) => {
    if (s.youth || !s.windows?.length || seasonOf(s.windows[0][0]) !== season) return false;
    const hunted = (d: Ymd) => inSeason.some((e) => e.huntedOn === d && speciesOf(e).includes(s.species));
    const opener = s.windows[0][0];
    const closer = s.windows[s.windows.length - 1][1];
    const lastWeek = Array.from({ length: 7 }, (_, i) => addDays(closer, -i));
    return hunted(opener) && lastWeek.some(hunted);
  });

  const allGameLands = new Set(entries.map((e) => gameLandOf(e, lookup)).filter(Boolean)).size;
  const allCounties = new Set(entries.flatMap((e) => countiesOf(e, lookup))).size;
  const placeVisits = new Set(entries.map(placeOf).filter(Boolean)).size;
  const seasonSpecies = new Set(inSeason.flatMap(speciesOf)).size;
  const yearSpecies = new Set(inSeason.flatMap(speciesOf));
  const fullCard = (['pheasant', 'dove', 'waterfowl', 'grouse', 'turkey'] as Species[]).filter((s) => yearSpecies.has(s)).length;
  const bestDogPoints = Math.max(0, ...dogStats(entries).map((d) => d.points));
  const dogMiles = entries.filter((e) => e.details?.dogs.length).reduce((t, e) => t + (e.details?.miles ?? 0), 0);
  const tracker = entries.filter((e) => e.details?.cover.length && e.details.weather?.windMph !== null && e.details?.weather?.windMph !== undefined).length;
  const drySpell = entries.filter((e) => flushesOf(e) > 0 && birdsInHand(e) === 0).length;

  const notTracked = { earned: false, progress: null, tracked: false };
  return [
    { id: 'boot-leather', name: 'Boot Leather', rule: '50 miles walked in a season', ...prog(Math.floor(st.miles), 50) },
    { id: 'dawn-patrol', name: 'Dawn Patrol', rule: '5 hunts started within 30 min of legal light', ...prog(dawn, 5) },
    { id: 'cold-front', name: 'Cold Front', rule: 'Hunted on 3 days under 20°F', ...prog(coldDays, 3) },
    { id: 'twenty-afield', name: 'Twenty Afield', rule: '20 days logged in a season', ...prog(days.size, 20) },
    { id: 'opener-to-closer', name: 'Opener to Closer', rule: 'Hunted the opener and the last week of the same season', earned: openerToCloser, progress: null, tracked: true },
    { id: 'game-lands-rambler', name: 'Game Lands Rambler', rule: '10 different SGLs', ...prog(allGameLands, 10) },
    { id: 'county-line', name: 'County Line', rule: 'Hunted in 5 counties', ...prog(allCounties, 5) },
    { id: 'new-ground', name: 'New Ground', rule: 'First hunt at a place you’d never logged', earned: placeVisits >= 2, progress: null, tracked: true },
    { id: 'five-bird-season', name: 'Five-Bird Season', rule: 'Hunted 5 species in one season', ...prog(seasonSpecies, 5) },
    { id: 'full-card', name: 'Full Card', rule: 'Pheasant, dove, waterfowl, grouse/woodcock and turkey in one year', ...prog(fullCard, 5) },
    { id: 'good-dog', name: 'Good Dog', rule: '25 points for one dog', ...prog(bestDogPoints, 25) },
    { id: 'dog-miles-100', name: 'Dog Miles 100', rule: '100 miles with a dog logged', ...prog(Math.floor(dogMiles), 100) },
    { id: 'tracker', name: 'Tracker', rule: 'Cover type + wind on 15 hunts', ...prog(tracker, 15) },
    { id: 'regs-reader', name: 'Regs Reader', rule: 'Opened “open today?” before 10 hunts', ...notTracked },
    { id: 'mentor', name: 'Mentor', rule: 'Logged a hunt with a new or youth hunter in your crew', ...notTracked },
    { id: 'dry-spell-survivor', name: 'Dry Spell Survivor', rule: '5 hunts with flushes but no birds in hand', ...prog(drySpell, 5) },
  ];
}

export interface Recap {
  headline: [string, string, string | null];
  subline: string;
}

/** Season recap card text. Effort only; bird totals are never part of it. */
export function recap(st: SeasonStats, dogs: DogStats[]): Recap {
  const bestDog = [...dogs].sort((a, b) => b.points - a.points)[0];
  return {
    headline: [
      `${st.daysAfield} ${st.daysAfield === 1 ? 'DAY' : 'DAYS'}.`,
      `${st.flushes} ${st.flushes === 1 ? 'FLUSH' : 'FLUSHES'}.`,
      bestDog && bestDog.points > 0 ? 'ONE GOOD DOG.' : null,
    ],
    subline: `${st.gameLands} game ${st.gameLands === 1 ? 'land' : 'lands'} · ${st.counties} ${st.counties === 1 ? 'county' : 'counties'}`,
  };
}
