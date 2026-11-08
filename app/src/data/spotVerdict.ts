import { entryAtPlace } from './pastSeasons';
import { windowsForCounty, stockingCountyOf, type StockingWindow } from './places';
import { placeSpecies, speciesStatus, unpublishedLine, type SpeciesStatus } from './seasons';
import { flushesOf } from './stats';
import type { JournalEntry } from './journal';
import type { Place, Species } from './types';
import { speciesLabel } from './types';
import { formatDay, type Ymd } from '@/lib/time';

/**
 * Spot verdict — private on-device summary of the owner's own past hunts at a place.
 *
 * Words (top → bottom): Closed → New to you → Slow / Mixed / Productive.
 * Rate = place flushes / hours for single-place visits only. Multi-place hunts
 * are shown as dashed dots and never enter the median.
 *
 * Crew (when opted in per Plan): only hunts that ended ≥12 hours before `asOf`,
 * and on the Plan's local calendar day the verdict + stocking line are frozen
 * at local midnight of that date (device time zone). Owner view is live.
 */

export const VERDICT_PRODUCTIVE = 1.0;
export const VERDICT_MIXED = 0.4; // Mixed ≥ 0.4 and < 1.0; Slow otherwise
export const VERDICT_SLOW = 0.4;
export const MIN_VISITS = 2;
export const WINDOW = 5;
export const CREW_MIN_AGE_MS = 12 * 3600_000;

export const VERDICT_WORDS = ['Closed', 'New to you', 'Slow', 'Mixed', 'Productive'] as const;
export type VerdictWord = (typeof VERDICT_WORDS)[number];

export type DotKind = 'productive' | 'mixed' | 'slow' | 'zero' | 'no_hours';

export interface VerdictVisit {
  entry: JournalEntry;
  /** Flushes attributed to this place (placeCounts row), or total when single-place. */
  flushes: number;
  hours: number | null;
  rate: number | null;
  multiPlace: boolean;
  dot: DotKind;
  endedAt: Date;
}

export interface SpotVerdict {
  word: VerdictWord;
  /** Short factual line under the word (never a forecast). */
  line: string;
  /** Always shown for owner; crew uses crewHonestLine instead. */
  honestLine: string;
  /** Crew-only label when audience is crew. */
  crewHonestLine: string | null;
  huntsCounted: number;
  visits: VerdictVisit[];
  /** Last ≤ WINDOW visits at the place (for dots / Why), newest last. */
  dots: DotKind[];
  stockingLine: string | null;
  frozen: boolean;
  audience: 'owner' | 'crew';
}

export const CREW_TOGGLE_COPY =
  "Show my spot verdict to this crew. It's based on my past hunts here, at least 12 hours old, and doesn't update on hunt day.";

/** Exact stocking secondary line (lawyer / engineer). */
export function stockingVerdictLine(county: string, dates: string): string {
  return `PGC lists a pheasant release window for ${county} County, ${dates}. Releases vary by property and day. This is not a count of birds here. From PGC stocking data.`;
}

export function crewHonestLine(ownerDisplayName: string, n: number): string {
  const who = ownerDisplayName.trim() || 'Owner';
  return `${who}'s history here · ${n} past hunts · not a prediction or a report of birds now`;
}

export function ownerHonestLine(n: number): string {
  return `Based on your ${n} hunts here · not a prediction`;
}

/** Device-local calendar Ymd for a Date. */
export function localYmd(d: Date): Ymd {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local midnight (00:00:00.000) on the Plan's date in the device time zone. */
export function localMidnightOn(ymd: Ymd): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** True from local midnight on planDate until the next local midnight. */
export function isHuntDayFrozen(planDate: Ymd, now = new Date()): boolean {
  return localYmd(now) === planDate;
}

/**
 * Parse "HH:MM" or "H:MM" as local wall time on huntedOn. Returns null if unparseable.
 */
function localStartOn(huntedOn: Ymd, startTime: string | null | undefined): Date | null {
  if (!startTime) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  if (!m) return null;
  const [y, mo, d] = huntedOn.split('-').map(Number);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

/**
 * When the hunt is treated as having ended (for the crew 12h rule).
 * Prefer startTime + hours on huntedOn (device local); else createdAt; else end of huntedOn local day.
 */
export function huntEndedAt(e: JournalEntry): Date {
  const hours = e.details?.hours;
  const huntedOn = e.huntedOn;
  if (huntedOn) {
    const start = localStartOn(huntedOn, e.details?.startTime);
    if (start && hours != null && hours > 0) {
      return new Date(start.getTime() + hours * 3600_000);
    }
  }
  if (e.createdAt) {
    const c = new Date(e.createdAt);
    if (!Number.isNaN(c.getTime())) return c;
  }
  if (huntedOn) {
    const [y, m, d] = huntedOn.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }
  return new Date(0);
}

function placeFlushCount(e: JournalEntry, placeId: string): number {
  const row = (e.placeCounts ?? []).find((c) => c.placeId === placeId);
  if (row) return row.flushed;
  return flushesOf(e);
}

function isMultiPlace(e: JournalEntry): boolean {
  return (e.placeCounts ?? []).filter((c) => c.placeId).length > 1;
}

function dotFor(rate: number | null, flushes: number, multi: boolean, hours: number | null): DotKind {
  if (multi || hours == null || hours <= 0) return 'no_hours';
  if (flushes === 0) return 'zero';
  if (rate != null && rate >= VERDICT_PRODUCTIVE) return 'productive';
  if (rate != null && rate >= VERDICT_MIXED) return 'mixed';
  return 'slow';
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Format a stocking window's dates for the lawyer line (prefer shipWeek, else formatDay range). */
export function formatStockingDates(w: StockingWindow): string {
  const ship = (w.shipWeek || '').trim();
  if (ship) return ship.replace(/\.$/, '');
  if (w.windowStart === w.windowEnd) return formatDay(w.windowStart as Ymd);
  return `${formatDay(w.windowStart as Ymd)} – ${formatDay(w.windowEnd as Ymd)}`;
}

/**
 * County release window overlapping reference ±7 days. Never per-property.
 * Returns null when the place isn't a stocking point or no window overlaps.
 */
export function overlappingStockingWindow(
  place: Pick<Place, 'type'> & Partial<Pick<Place, 'county' | 'stockingCounty'>>,
  reference: Ymd,
  padDays = 7,
): StockingWindow | null {
  if (place.type !== 'stocking') return null;
  const county = stockingCountyOf(place as Pick<Place, 'county' | 'stockingCounty'>);
  const windows = windowsForCounty(county);
  const [y, m, d] = reference.split('-').map(Number);
  const ref = Date.UTC(y, m - 1, d);
  const pad = padDays * 86_400_000;
  for (const w of windows) {
    const [ys, ms, ds] = w.windowStart.split('-').map(Number);
    const [ye, me, de] = w.windowEnd.split('-').map(Number);
    const start = Date.UTC(ys, ms - 1, ds) - pad;
    const end = Date.UTC(ye, me - 1, de) + pad;
    if (ref >= start && ref <= end) return w;
  }
  return null;
}

function closedLine(
  place: VerdictPlace,
  reference: Ymd,
  huntSpecies: Species[] | undefined,
): { closed: boolean; line: string; unpublished?: string } {
  const wanted = (huntSpecies?.length ? huntSpecies : placeSpecies(place)).filter((s) =>
    placeSpecies(place).includes(s),
  );
  const list = wanted.length ? wanted : placeSpecies(place);
  const statuses = list.map((species) => ({ species, status: speciesStatus(species, reference, place.center) }));
  // Unpublished season: never the Closed verdict; the word comes from history and the line says why.
  const unpublished = statuses.find((s) => s.status.kind === 'unpublished')?.status;
  if (unpublished?.kind === 'unpublished') return { closed: false, line: '', unpublished: unpublishedLine(unpublished.year) };
  const anyOpen = statuses.some((s) => s.status.kind === 'open' || s.status.kind === 'sunday' || s.status.kind === 'check');
  if (anyOpen) return { closed: false, line: '' };
  const bits = statuses.map(({ species, status }) => describeClosedBit(species, status));
  return { closed: true, line: bits.filter(Boolean).join(' ') || 'Out of season for the species you hunt here.' };
}

function describeClosedBit(species: Species, status: SpeciesStatus): string {
  const name = speciesLabel[species];
  if (status.kind === 'closed' && status.nextOpen) {
    return `${name} closed until ${formatDay(status.nextOpen.date)}${status.nextOpen.season.youth ? ' (youth)' : ''}.`;
  }
  if (status.kind === 'closed') return `${name} is out of season.`;
  return '';
}

function buildVisits(entries: JournalEntry[], placeId: string): VerdictVisit[] {
  const at = entries.filter((e) => entryAtPlace(e, placeId));
  // Newest first for window pick, then reverse for oldest→newest dots.
  const sorted = [...at].sort((a, b) => (b.huntedOn ?? '').localeCompare(a.huntedOn ?? '') || b.createdAt.localeCompare(a.createdAt));
  const windowed = sorted.slice(0, WINDOW).reverse();
  return windowed.map((entry) => {
    const multiPlace = isMultiPlace(entry);
    const flushes = placeFlushCount(entry, placeId);
    const hours = multiPlace ? null : entry.details?.hours ?? null;
    const rate = hours != null && hours > 0 ? flushes / hours : null;
    return {
      entry,
      flushes,
      hours,
      rate,
      multiPlace,
      dot: dotFor(rate, flushes, multiPlace, hours),
      endedAt: huntEndedAt(entry),
    };
  });
}

function wordFromRates(rates: number[], recentFlushes: number[]): VerdictWord {
  if (rates.length < MIN_VISITS) return 'New to you';
  const med = median(rates.slice(-WINDOW))!;
  // "0 flushes on each of the last 3 visits" → Slow even if median would be Mixed.
  const last3 = recentFlushes.slice(-3);
  if (last3.length >= 3 && last3.every((f) => f === 0)) return 'Slow';
  if (med >= VERDICT_PRODUCTIVE) return 'Productive';
  if (med >= VERDICT_MIXED) return 'Mixed';
  return 'Slow';
}

function ownerLine(word: VerdictWord, counted: VerdictVisit[], allAtPlace: number): string {
  if (word === 'New to you') {
    if (allAtPlace === 0) return "You haven't logged a hunt here yet. Log one to start your record.";
    return '1 hunt logged here. Log one more for a verdict.';
  }
  const withBirds = counted.filter((v) => v.flushes > 0).length;
  const n = counted.length;
  if (word === 'Slow' && counted.slice(-3).length >= 3 && counted.slice(-3).every((v) => v.flushes === 0)) {
    return 'No flushes on your last 3 hunts here.';
  }
  if (word === 'Productive') return `You flushed birds on ${withBirds} of your last ${n} hunts here.`;
  if (word === 'Mixed') return `Birds on ${withBirds} of your last ${n} hunts here, at a slower pace.`;
  return `Birds on ${withBirds} of your last ${n} hunts here.`;
}

export type VerdictPlace = Pick<Place, 'id' | 'name' | 'type' | 'center' | 'species' | 'access'> & Partial<Pick<Place, 'county' | 'stockingCounty'>>;

export interface ComputeVerdictOpts {
  place: VerdictPlace;
  entries: JournalEntry[];
  /** Date the season/stocking state is evaluated for (today or plan date). */
  reference: Ymd;
  /** Species the plan cares about; omit for place-default. */
  species?: Species[];
  audience?: 'owner' | 'crew';
  /** Owner display name for the crew honest line. */
  ownerDisplayName?: string;
  /**
   * Instant used for the crew 12h cutoff and hunt-day freeze.
   * On the Plan's local calendar day, pass localMidnightOn(planDate) (or let
   * freeze auto-apply when planDate is set).
   */
  now?: Date;
  /** When set and audience is crew, freeze at local midnight on this date during that local day. */
  planDate?: Ymd;
}

/**
 * Compute the spot verdict. Stocking never changes the word — only the secondary line.
 */
export function computeSpotVerdict(opts: ComputeVerdictOpts): SpotVerdict {
  const audience = opts.audience ?? 'owner';
  const now = opts.now ?? new Date();
  const planDate = opts.planDate;
  const frozen = audience === 'crew' && !!planDate && isHuntDayFrozen(planDate, now);
  const asOf = frozen && planDate ? localMidnightOn(planDate) : now;

  const closed = closedLine(opts.place, opts.reference, opts.species);
  const allAt = opts.entries.filter((e) => entryAtPlace(e, opts.place.id));

  let eligible = allAt;
  if (audience === 'crew') {
    eligible = allAt.filter((e) => asOf.getTime() - huntEndedAt(e).getTime() >= CREW_MIN_AGE_MS);
  }

  // All eligible single-place visits with hours (for New-to-you / median pool).
  const withHoursAll = eligible
    .filter((e) => !isMultiPlace(e) && (e.details?.hours ?? 0) > 0)
    .sort((a, b) => (b.huntedOn ?? '').localeCompare(a.huntedOn ?? '') || b.createdAt.localeCompare(a.createdAt));
  const visits = buildVisits(eligible, opts.place.id);
  const counted = visits.filter((v) => !v.multiPlace && v.hours != null && v.hours > 0);
  const rates = counted.map((v) => v.rate!).filter((r) => Number.isFinite(r));
  const recentFlushes = counted.map((v) => v.flushes);

  let word: VerdictWord;
  let line: string;
  if (closed.closed) {
    word = 'Closed';
    line = closed.line;
  } else if (withHoursAll.length < MIN_VISITS) {
    word = 'New to you';
    line = ownerLine(word, counted, withHoursAll.length);
  } else {
    word = wordFromRates(rates, recentFlushes);
    line = ownerLine(word, counted, withHoursAll.length);
  }

  const nForHonest = audience === 'crew' ? eligible.length : allAt.length;
  const honestLine = ownerHonestLine(Math.max(nForHonest, counted.length));
  const crewLine =
    audience === 'crew' ? crewHonestLine(opts.ownerDisplayName ?? 'Owner', Math.max(nForHonest, counted.length)) : null;

  const stockingRef = opts.reference;
  const win = overlappingStockingWindow(opts.place, stockingRef);
  const stockingLine = win
    ? stockingVerdictLine(stockingCountyOf(opts.place as Pick<Place, 'county' | 'stockingCounty'>) || win.county, formatStockingDates(win))
    : null;

  return {
    word,
    line,
    honestLine,
    crewHonestLine: crewLine,
    huntsCounted: counted.length,
    visits,
    dots: visits.map((v) => v.dot),
    stockingLine,
    frozen,
    audience,
  };
}

/**
 * Whether a crew member may see the owner's verdict for this plan.
 * Default off. Never show when frozen is irrelevant — freeze still shows the
 * frozen snapshot when opted in; this gate is the opt-in itself.
 */
export function crewMaySeeVerdict(showToCrew: boolean | null | undefined): boolean {
  return showToCrew === true;
}

/**
 * Share / export / screenshot-share surfaces must never include the verdict.
 * Used by tests and any future share builders.
 */
export function verdictAllowedInShareImage(_audience: 'owner' | 'crew' | 'public' = 'public'): boolean {
  return false;
}

export function verdictShareActionsAllowed(audience: 'owner' | 'crew'): boolean {
  // Crew: no share, export, or screenshot-share. Owner also never puts it in a share image.
  return false;
}


/** Payload stored on the Plan for crew (no raw journal rows). */
export interface SpotVerdictSnapshot {
  word: VerdictWord;
  line: string;
  crewHonestLine: string;
  stockingLine: string | null;
  dots: DotKind[];
  huntsCounted: number;
  frozen: boolean;
  /** ISO time the owner computed this snapshot. */
  computedAt: string;
  reference: Ymd;
}

export function toCrewSnapshot(v: SpotVerdict, reference: Ymd, now = new Date()): SpotVerdictSnapshot {
  return {
    word: v.word,
    line: v.line,
    crewHonestLine: v.crewHonestLine ?? crewHonestLine('Owner', v.huntsCounted),
    stockingLine: v.stockingLine,
    dots: v.dots,
    huntsCounted: v.huntsCounted,
    frozen: v.frozen,
    computedAt: now.toISOString(),
    reference,
  };
}

export function verdictFromSnapshot(s: SpotVerdictSnapshot): SpotVerdict {
  return {
    word: s.word,
    line: s.line,
    honestLine: s.crewHonestLine,
    crewHonestLine: s.crewHonestLine,
    huntsCounted: s.huntsCounted,
    visits: [],
    dots: s.dots,
    stockingLine: s.stockingLine,
    frozen: s.frozen,
    audience: 'crew',
  };
}
