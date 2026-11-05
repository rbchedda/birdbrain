import type { JournalEntry } from './journal';
import { dated, flushesOf, seasonOf } from './stats';
import type { DiaryWeather } from './types';
import { addDays, type Ymd } from '@/lib/time';

/**
 * "This week in past seasons" — private, on-device only.
 *
 * Week match
 * ----------
 * A hunt on date H matches a reference date R when the absolute day gap between
 * R and H remapped onto R's calendar year is ≤ WEEK_HALF_WIDTH (3), i.e. a
 * 7-day window centered on the same month/day across years.
 *
 * Remapping: take H's month and day, apply them to R's year. Feb 29 in a
 * non-leap reference year clamps to Feb 28. Distance is circular on R's year
 * length, so year-boundary weeks (Dec 30 ↔ Jan 1) still match.
 *
 * Prior seasons only: seasonOf(H) is strictly earlier than seasonOf(R)
 * (PA seasons run Jul 1 – Jun 30). The current season is never included, so a
 * plan for next Saturday does not count this season's opening weekend.
 *
 * Place filter: any placeCounts.placeId equals the spot id. Name-only rows
 * (placeId null) are ignored — we will not guess.
 *
 * Honesty thresholds
 * ------------------
 * - 0 matching hunts → empty state, no invented numbers.
 * - ≥1 → show hunt count, flush/harvest totals, and a short factual note.
 * - Best-time / weather hint only when ≥ MIN_BEST_SAMPLE matching hunts carry
 *   the needed field (startTime or weather). Below that the hint is omitted,
 *   never extrapolated.
 */

export const WEEK_HALF_WIDTH = 3;
/** Minimum matching hunts with startTime (or weather) before a "best" hint. */
export const MIN_BEST_SAMPLE = 3;

export type TimeOfDay = 'morning' | 'midday' | 'afternoon';

export interface PastSeasonsSummary {
  /** Reference date the week is centered on. */
  reference: Ymd;
  placeId: string;
  /** Matching hunts from prior seasons (newest first). */
  hunts: JournalEntry[];
  huntCount: number;
  /** Distinct PA seasons represented. */
  seasons: number;
  flushes: number;
  harvest: number;
  /** One factual sentence; never speculative. */
  note: string;
  /** Present only when ≥ MIN_BEST_SAMPLE hunts have startTime. */
  bestTime: { bucket: TimeOfDay; label: string; sample: number } | null;
  /** Present only when ≥ MIN_BEST_SAMPLE hunts have weather. Taken from the best flush day. */
  bestWeather: { text: string; sample: number; weather: DiaryWeather } | null;
  empty: boolean;
}

const harvestOf = (e: JournalEntry) =>
  e.details ? e.details.birds.reduce((t, b) => t + b.count, 0) : (e.placeCounts ?? []).reduce((t, c) => t + c.harvested, 0);

/** Days between two Ymds (UTC calendar math; same helper family as addDays). */
export function daysBetween(a: Ymd, b: Ymd): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

/** Remap H's month/day onto R's year; Feb 29 → Feb 28 when R's year is not a leap year. */
export function remapToYear(huntedOn: Ymd, referenceYear: number): Ymd {
  const [, m, d] = huntedOn.split('-').map(Number);
  const leap = referenceYear % 4 === 0 && (referenceYear % 100 !== 0 || referenceYear % 400 === 0);
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${referenceYear}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Length of a Gregorian calendar year. */
export function yearLength(year: number): number {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
}

/**
 * True when H falls in the ±WEEK_HALF_WIDTH window around R across years.
 * Uses circular day distance on R's year so Dec 30 matches Jan 1 (gap 1–2).
 */
export function sameCalendarWeek(huntedOn: Ymd, reference: Ymd, halfWidth = WEEK_HALF_WIDTH): boolean {
  const year = Number(reference.slice(0, 4));
  const mapped = remapToYear(huntedOn, year);
  const d = Math.abs(daysBetween(mapped, reference));
  const circular = Math.min(d, yearLength(year) - d);
  return circular <= halfWidth;
}

export function entryAtPlace(e: JournalEntry, placeId: string): boolean {
  return (e.placeCounts ?? []).some((c) => c.placeId === placeId);
}

/** Bucket a local "HH:MM" start time. */
export function timeBucket(startTime: string): TimeOfDay {
  const h = Number(startTime.slice(0, 2));
  if (h < 10) return 'morning';
  if (h < 14) return 'midday';
  return 'afternoon';
}

const TIME_LABEL: Record<TimeOfDay, string> = {
  morning: 'Morning (before 10)',
  midday: 'Midday (10–2)',
  afternoon: 'Afternoon (after 2)',
};

function weatherText(w: DiaryWeather): string {
  const bits: string[] = [];
  if (w.windDir && w.windMph != null) bits.push(`${w.windDir} wind ${w.windMph} mph`);
  else if (w.windDir) bits.push(`${w.windDir} wind`);
  else if (w.windMph != null) bits.push(`Wind ${w.windMph} mph`);
  if (w.tempF != null) bits.push(`${w.tempF}°F`);
  if (w.sky) bits.push(w.sky);
  if (w.precip) bits.push(w.precip);
  return bits.join(' · ');
}

function buildNote(huntCount: number, seasons: number, flushes: number, harvest: number, withBirds: number): string {
  const seasonBit = seasons === 1 ? '1 prior season' : `${seasons} prior seasons`;
  const effort = `${huntCount} ${huntCount === 1 ? 'hunt' : 'hunts'} across ${seasonBit}`;
  if (flushes > 0 && withBirds > 0) {
    return `${effort} · ${flushes} ${flushes === 1 ? 'flush' : 'flushes'}, birds in hand on ${withBirds}.`;
  }
  if (flushes > 0) return `${effort} · ${flushes} ${flushes === 1 ? 'flush' : 'flushes'}.`;
  if (harvest > 0) return `${effort} · birds in hand on ${withBirds || huntCount}.`;
  return `${effort} · no flushes logged.`;
}

function pickBestTime(hunts: JournalEntry[]): PastSeasonsSummary['bestTime'] {
  const timed = hunts.filter((e) => e.details?.startTime);
  if (timed.length < MIN_BEST_SAMPLE) return null;
  const scores: Record<TimeOfDay, { flushes: number; n: number }> = {
    morning: { flushes: 0, n: 0 },
    midday: { flushes: 0, n: 0 },
    afternoon: { flushes: 0, n: 0 },
  };
  for (const e of timed) {
    const b = timeBucket(e.details!.startTime!);
    scores[b].n += 1;
    scores[b].flushes += flushesOf(e);
  }
  // Prefer the bucket with the highest flush rate; require at least one hunt in it.
  let best: TimeOfDay | null = null;
  let bestRate = -1;
  (Object.keys(scores) as TimeOfDay[]).forEach((k) => {
    if (scores[k].n === 0) return;
    const rate = scores[k].flushes / scores[k].n;
    if (rate > bestRate || (rate === bestRate && scores[k].n > (best ? scores[best].n : 0))) {
      best = k;
      bestRate = rate;
    }
  });
  if (!best) return null;
  return { bucket: best, label: TIME_LABEL[best], sample: timed.length };
}

function pickBestWeather(hunts: JournalEntry[]): PastSeasonsSummary['bestWeather'] {
  const withWx = hunts.filter((e) => e.details?.weather && weatherText(e.details.weather).length > 0);
  if (withWx.length < MIN_BEST_SAMPLE) return null;
  const best = [...withWx].sort((a, b) => flushesOf(b) - flushesOf(a) || harvestOf(b) - harvestOf(a))[0];
  const w = best.details!.weather!;
  const text = weatherText(w);
  if (!text) return null;
  return { text, sample: withWx.length, weather: w };
}

/**
 * Summarize the signed-in user's own hunts at `placeId` for the same calendar
 * week as `reference`, looking only at prior PA seasons.
 */
export function pastSeasonsForPlace(
  entries: JournalEntry[],
  placeId: string,
  reference: Ymd,
): PastSeasonsSummary {
  const refSeason = seasonOf(reference);
  const hunts = dated(entries)
    .filter((e) => entryAtPlace(e, placeId))
    .filter((e) => seasonOf(e.huntedOn) < refSeason)
    .filter((e) => sameCalendarWeek(e.huntedOn, reference))
    .sort((a, b) => (a.huntedOn < b.huntedOn ? 1 : a.huntedOn > b.huntedOn ? -1 : 0));

  const seasonSet = new Set(hunts.map((e) => seasonOf(e.huntedOn)));
  const flushes = hunts.reduce((t, e) => t + flushesOf(e), 0);
  const harvest = hunts.reduce((t, e) => t + harvestOf(e), 0);
  const withBirds = hunts.filter((e) => harvestOf(e) > 0).length;

  if (hunts.length === 0) {
    return {
      reference,
      placeId,
      hunts: [],
      huntCount: 0,
      seasons: 0,
      flushes: 0,
      harvest: 0,
      note: 'No hunts logged here for this calendar week in earlier seasons.',
      bestTime: null,
      bestWeather: null,
      empty: true,
    };
  }

  return {
    reference,
    placeId,
    hunts,
    huntCount: hunts.length,
    seasons: seasonSet.size,
    flushes,
    harvest,
    note: buildNote(hunts.length, seasonSet.size, flushes, harvest, withBirds),
    bestTime: pickBestTime(hunts),
    bestWeather: pickBestWeather(hunts),
    empty: false,
  };
}

/** Convenience: shift a reference date by n days (tests / year-boundary cases). */
export const shiftYmd = (ymd: Ymd, n: number) => addDays(ymd, n);
