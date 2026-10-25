import { addDays, formatDay, midnightET, publicAfterET, weekdayOf, type Ymd } from '@/lib/time';

import type { JournalEntry } from './journal';
import { countiesOf, dated, flushesOf, gameLandOf, placeOf, seasonLabel, seasonOf, speciesOf, type PlaceLookup } from './stats';
import { speciesLabel, type Dog, type Species } from './types';

/**
 * Aggregations behind Profile › Stats. Everything is computed on the device from
 * the private hunt log (JournalEntry). Effort and variety only: no bird totals,
 * no coordinates, nothing that ranks one hunter against another.
 */

export const ALL_TIME = 'all';
/** A season ('2026-27') or ALL_TIME. */
export type Scope = string;
export const PA_COUNTIES = 67;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];
export const monthLong = (ym: string) => MONTHS_LONG[Number(ym.slice(5, 7)) - 1];

type Hunt = JournalEntry & { huntedOn: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** 1 decimal, trailing .0 dropped: 96, 7.7. */
export const fmtNum = (n: number) => (Math.round(n * 10) / 10).toString();
const hoursOf = (e: JournalEntry) => e.details?.hours ?? 0;
const milesOf = (e: JournalEntry) => e.details?.miles ?? 0;
const dogPointsOf = (e: JournalEntry) => (e.details?.dogs ?? []).reduce((t, d) => t + d.points, 0);
const sumBy = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
const distinct = <T,>(xs: T[]) => [...new Set(xs)];

export const seasonStartYear = (season: string) => Number(season.slice(0, 4));
export const prevSeason = (season: string) => {
  const y = seasonStartYear(season) - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};
/** 'YYYY-MM' for month index 0..11 of a season (0 = Jul). */
const seasonMonth = (season: string, i: number) => {
  const y = seasonStartYear(season);
  return i < 6 ? `${y}-${String(7 + i).padStart(2, '0')}` : `${y + 1}-${String(i - 5).padStart(2, '0')}`;
};
const seasonMonthIndex = (ym: string) => {
  const m = Number(ym.slice(5, 7));
  return m >= 7 ? m - 7 : m + 5;
};

export function huntsInScope(entries: JournalEntry[], scope: Scope): Hunt[] {
  const all = dated(entries);
  return scope === ALL_TIME ? all : all.filter((e) => seasonOf(e.huntedOn) === scope);
}

/** Seasons that have at least one hunt, newest first; the current season is always first. */
export function seasonsWithHunts(entries: JournalEntry[], current: string) {
  const days = new Map<string, Set<string>>();
  for (const e of dated(entries)) {
    const s = seasonOf(e.huntedOn);
    days.set(s, (days.get(s) ?? new Set()).add(e.huntedOn));
  }
  const list = [...days.keys()].filter((s) => s !== current).sort().reverse();
  return [current, ...list].map((season) => ({ season, days: days.get(season)?.size ?? 0 }));
}

export const totalDays = (entries: JournalEntry[]) => new Set(dated(entries).map((e) => e.huntedOn)).size;

export interface Ctx {
  lookup: PlaceLookup;
  roster: Dog[];
  /** Today's date in ET; decides "so far this season" and the calendar's last month. */
  today: Ymd;
  /** Show woodcock as its own bird (once the app can log it); until then it shares the grouse bar. */
  woodcockSeparate: boolean;
  /** Compare with last season (hatched bars, "more than last season"). Off without multiYearStats. */
  compareLast?: boolean;
}

export interface Table {
  headers: string[];
  rows: string[][];
}

export interface Gate {
  ready: boolean;
  have: number;
  need: number;
  /** Next step shown on the locked teaser. */
  hint: string;
}
const gate = (have: number, need: number, hint: (left: number) => string): Gate => ({ ready: have >= need, have, need, hint: hint(Math.max(0, need - have)) });

// --- Tiles ---------------------------------------------------------------------

export interface Tiles {
  days: number;
  /** null = never logged: shown as "–", not 0. */
  flushes: number | null;
  hours: number | null;
  gameLands: number | null;
}

export function tilesFor(hunts: Hunt[], lookup: PlaceLookup): Tiles {
  const flushes = sumBy(hunts, flushesOf);
  const hours = sumBy(hunts, hoursOf);
  const lands = new Set(hunts.map((e) => gameLandOf(e, lookup)).filter(Boolean)).size;
  return {
    days: new Set(hunts.map((e) => e.huntedOn)).size,
    flushes: flushes > 0 ? flushes : null,
    hours: hours > 0 ? Math.round(hours * 10) / 10 : null,
    gameLands: lands > 0 ? lands : null,
  };
}

// --- 1. Days afield by month ---------------------------------------------------

export interface MonthBar {
  key: string;
  label: string;
  longLabel: string;
  days: number;
  /** Same month last season; null when there is no last season to compare. */
  last: number | null;
  flushes: number;
  hours: number;
}

export interface DaysByMonth {
  unit: 'month' | 'season';
  bars: MonthBar[];
  total: number;
  lastTotal: number | null;
  peak: MonthBar | null;
  insight: string;
  a11y: string;
  table: Table;
  note: string;
}

function monthCounts(hunts: Hunt[]) {
  const m = new Map<string, { days: Set<string>; flushes: number; hours: number }>();
  for (const e of hunts) {
    const k = e.huntedOn.slice(0, 7);
    const v = m.get(k) ?? { days: new Set<string>(), flushes: 0, hours: 0 };
    v.days.add(e.huntedOn);
    v.flushes += flushesOf(e);
    v.hours += hoursOf(e);
    m.set(k, v);
  }
  return m;
}

export function daysByMonth(entries: JournalEntry[], scope: Scope, ctx: Ctx): DaysByMonth {
  if (scope === ALL_TIME) {
    const seasons = seasonsWithHunts(entries, seasonOf(ctx.today)).filter((s) => s.days > 0).reverse();
    const bars: MonthBar[] = seasons.map((s) => {
      const hs = huntsInScope(entries, s.season);
      return { key: s.season, label: `${s.season.slice(2, 4)}–${s.season.slice(5)}`, longLabel: seasonLabel(s.season), days: s.days, last: null, flushes: sumBy(hs, flushesOf), hours: sumBy(hs, hoursOf) };
    });
    const total = sumBy(bars, (b) => b.days);
    const peak = bars.reduce<MonthBar | null>((b, x) => (!b || x.days > b.days ? x : b), null);
    const insight = total ? `${plural(total, 'day')} afield over ${plural(bars.length, 'season')}.${peak && bars.length > 1 ? ` ${peak.longLabel} was your biggest with ${peak.days}.` : ''}` : 'No days logged yet.';
    return {
      unit: 'season', bars, total, lastTotal: null, peak, insight,
      a11y: `Days afield by season. ${insight}`,
      table: { headers: ['Season', 'Days', 'Flushes', 'Hours'], rows: bars.map((b) => [b.longLabel, String(b.days), String(b.flushes), fmtNum(b.hours)]) },
      note: `From ${plural(total, 'hunt day')}`,
    };
  }
  const cur = monthCounts(huntsInScope(entries, scope));
  const lastScope = prevSeason(scope);
  const last = ctx.compareLast === false ? new Map<string, { days: Set<string>; flushes: number; hours: number }>() : monthCounts(huntsInScope(entries, lastScope));
  const lastTotal = sumBy([...last.values()], (v) => v.days.size);
  const hasLast = lastTotal > 0;
  const idx = [...cur.keys(), ...(hasLast ? [...last.keys()].map((k) => seasonMonth(scope, seasonMonthIndex(k))) : [])].map(seasonMonthIndex);
  let lo = Math.min(2, ...idx);
  let hi = Math.max(7, ...idx);
  if (seasonOf(ctx.today) === scope) hi = Math.max(hi, seasonMonthIndex(ctx.today.slice(0, 7)));
  lo = Math.max(0, lo);
  hi = Math.min(11, hi);
  const bars: MonthBar[] = [];
  for (let i = lo; i <= hi; i++) {
    const key = seasonMonth(scope, i);
    const c = cur.get(key);
    const l = last.get(seasonMonth(lastScope, i));
    bars.push({ key, label: monthShort(key), longLabel: monthLong(key), days: c?.days.size ?? 0, last: hasLast ? (l?.days.size ?? 0) : null, flushes: c?.flushes ?? 0, hours: c?.hours ?? 0 });
  }
  const total = sumBy(bars, (b) => b.days);
  const withDays = bars.filter((b) => b.days > 0);
  const peak = withDays.reduce<MonthBar | null>((b, x) => (!b || x.days > b.days ? x : b), null);
  const isNow = seasonOf(ctx.today) === scope;
  let insight: string;
  if (!total) insight = isNow ? 'No days logged this season yet.' : 'No days logged this season.';
  else {
    const diff = total - lastTotal;
    const cmp = !hasLast ? (isNow ? ' so far this season' : '') : diff === 0 ? ', the same as last season' : `, ${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'} than last season`;
    insight = `${plural(total, 'day')} afield${cmp}.${withDays.length > 1 && peak ? ` ${peak.longLabel} was your peak.` : ''}`;
  }
  const a11y = total
    ? `Days afield by month. ${plural(total, 'day')} this season${hasLast ? `, ${plural(lastTotal, 'day')} last season` : ''}.${peak && withDays.length > 1 ? ` Peak ${peak.longLabel}, ${plural(peak.days, 'day')}.` : ''}`
    : `Days afield by month. ${insight}`;
  return {
    unit: 'month', bars, total, lastTotal: hasLast ? lastTotal : null, peak: withDays.length > 1 ? peak : null, insight, a11y,
    table: { headers: ['Month', 'Days', 'Flushes', 'Hours'], rows: bars.map((b) => [b.label, String(b.days), String(b.flushes), fmtNum(b.hours)]) },
    note: `From ${plural(total, 'hunt day')}`,
  };
}

// --- 2. Season calendar --------------------------------------------------------

export interface CalCell {
  ymd: Ymd;
  hunts: number;
}
export interface DayHunt {
  entryId: string;
  place: string | null;
  flushes: number;
  hours: number | null;
  miles: number | null;
  dogs: string[];
}
export interface Calendar {
  /** Weeks as columns, Sunday to Saturday; null outside the shown range. */
  weeks: (CalCell | null)[][];
  monthLabels: { col: number; label: string }[];
  months: { key: string; title: string; cells: (CalCell | null)[] }[];
  total: number;
  weekendDays: number;
  insight: string;
  detailInsight: string;
  a11y: string;
  byDay: Map<Ymd, DayHunt[]>;
}

export const dayHuntsOf = (e: JournalEntry): DayHunt => ({
  entryId: e.id,
  place: placeOf(e),
  flushes: flushesOf(e),
  hours: e.details?.hours ?? null,
  miles: e.details?.miles ?? null,
  dogs: (e.details?.dogs ?? []).map((d) => d.name),
});

export function calendarFor(entries: JournalEntry[], season: string, ctx: Ctx): Calendar {
  const hunts = huntsInScope(entries, season);
  const byDay = new Map<Ymd, DayHunt[]>();
  for (const e of hunts) byDay.set(e.huntedOn, [...(byDay.get(e.huntedOn) ?? []), dayHuntsOf(e)]);
  const y = seasonStartYear(season);
  const keys = [...byDay.keys()].sort();
  let first: Ymd = `${y}-09-01`;
  if (keys.length && keys[0] < first) first = `${keys[0].slice(0, 7)}-01`;
  let lastMonth = `${y + 1}-02`;
  const maxKey = keys.length ? keys[keys.length - 1].slice(0, 7) : null;
  if (maxKey && maxKey > lastMonth) lastMonth = maxKey;
  if (seasonOf(ctx.today) === season && ctx.today.slice(0, 7) > lastMonth) lastMonth = ctx.today.slice(0, 7);
  const lastDay = addDays(`${nextMonth(lastMonth)}-01`, -1);
  const cell = (d: Ymd): CalCell => ({ ymd: d, hunts: byDay.get(d)?.length ?? 0 });
  const gridStart = addDays(first, -weekdayOf(first));
  const weeks: (CalCell | null)[][] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let seen = '';
  for (let w = gridStart; w <= lastDay; w = addDays(w, 7)) {
    const col: (CalCell | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(w, i);
      col.push(d < first || d > lastDay ? null : cell(d));
    }
    const firstReal = col.find(Boolean);
    if (firstReal && firstReal.ymd.slice(0, 7) !== seen) {
      seen = firstReal.ymd.slice(0, 7);
      monthLabels.push({ col: weeks.length, label: monthShort(seen) });
    }
    weeks.push(col);
  }
  const months: Calendar['months'] = [];
  for (let m = first.slice(0, 7); m <= lastMonth; m = nextMonth(m)) {
    const start = `${m}-01`;
    const end = addDays(`${nextMonth(m)}-01`, -1);
    const cells: (CalCell | null)[] = Array.from({ length: weekdayOf(start) }, () => null);
    for (let d = start; d <= end; d = addDays(d, 1)) cells.push(cell(d));
    months.push({ key: m, title: `${monthLong(m)} ${m.slice(0, 4)}`.toUpperCase(), cells });
  }
  const days = [...byDay.keys()];
  const weekendDays = days.filter((d) => [0, 6].includes(weekdayOf(d))).length;
  const total = days.length;
  const weekdayDays = total - weekendDays;
  let insight: string;
  if (total < 3) insight = total ? `${plural(total, 'day')} on the calendar so far.` : 'No days logged this season yet.';
  else if (weekendDays * 2 >= total) insight = `Weekends are your season: ${weekendDays} of your ${total} days were Sat or Sun.`;
  else insight = `Weekdays are your season: ${weekdayDays} of your ${total} days were Mon to Fri.`;
  const detailInsight = total < 3 ? insight : weekendDays * 2 >= total ? `${weekendDays} of your ${total} days were a Saturday or Sunday.` : `${weekdayDays} of your ${total} days were a weekday.`;
  return { weeks, monthLabels, months, total, weekendDays, insight, detailInsight, a11y: `Season calendar. ${insight}`, byDay };
}

function nextMonth(ym: string) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// --- 3. What you hunted --------------------------------------------------------

export interface SpeciesRow {
  key: string;
  label: string;
  species: Species[];
  days: number;
  pct: number;
  flushes: number;
  /** Flushes an hour on hunts with hours; null when none have hours. */
  rate: number | null;
  bestMonth: { label: string; days: number } | null;
}
export interface SpeciesChart {
  rows: SpeciesRow[];
  /** Every day afield in scope: the base for "N of your 30 days" and the percents. */
  daysWithBird: number;
  insight: string;
  a11y: string;
  table: Table;
  note: string;
  /** Footnote while woodcock shares the grouse bucket; null once it has its own bar. */
  woodcockNote: string | null;
  variety: number;
}

const bucketOf = (s: Species, separate: boolean): string => (s === 'woodcock' && !separate ? 'grouse' : s);

export function speciesFor(hunts: Hunt[], ctx: Ctx, countOnce = false): SpeciesChart {
  const withBird = hunts.filter((e) => speciesOf(e).length);
  const sep = ctx.woodcockSeparate;
  const label = (b: string) => (b === 'grouse' && !sep ? 'Grouse / woodcock' : speciesLabel[b as Species]);
  const buckets = new Map<string, Hunt[]>();
  const once = new Map<string, string>();
  for (const e of withBird) {
    const bs = distinct(speciesOf(e).map((s) => bucketOf(s, sep)));
    if (countOnce && !once.has(e.huntedOn)) once.set(e.huntedOn, bs[0]);
    for (const b of bs) {
      if (countOnce && once.get(e.huntedOn) !== b) continue;
      buckets.set(b, [...(buckets.get(b) ?? []), e]);
    }
  }
  const daysWithBird = new Set(hunts.map((e) => e.huntedOn)).size;
  const rows: SpeciesRow[] = [...buckets.entries()]
    .map(([b, hs]) => {
      const days = new Set(hs.map((e) => e.huntedOn)).size;
      const months = monthCounts(hs);
      const best = [...months.entries()].map(([k, v]) => ({ k, n: v.days.size })).sort((a, c) => c.n - a.n || a.k.localeCompare(c.k))[0];
      const hrs = sumBy(hs, hoursOf);
      const withHours = hs.filter((e) => hoursOf(e) > 0);
      const rate = withHours.length ? sumBy(withHours, flushesOf) / sumBy(withHours, hoursOf) : null;
      return {
        key: b, label: label(b), species: b === 'grouse' && !sep ? (['grouse', 'woodcock'] as Species[]) : [b as Species], days,
        pct: daysWithBird ? Math.round((days / daysWithBird) * 100) : 0, flushes: sumBy(hs, flushesOf), rate: hrs > 0 ? rate : null,
        bestMonth: best ? { label: monthShort(best.k), days: best.n } : null,
      };
    })
    .sort((a, b) => b.days - a.days || a.label.localeCompare(b.label));
  const named = (r: SpeciesRow) => (r.key === 'grouse' && !sep ? 'Grouse and woodcock' : r.label);
  let insight = 'Log a bird on your hunts to see what you hunted.';
  if (rows.length === 1) insight = `${named(rows[0])} ${rows[0].days === daysWithBird ? `took all ${plural(daysWithBird, 'day')}` : `took ${rows[0].days} of your ${daysWithBird} days`}.`;
  else if (rows.length > 1) insight = `${named(rows[0])} took ${rows[0].days} of your ${daysWithBird} days, ${rows[1].label.toLowerCase()} ${rows[1].days}.`;
  const loggedDays = new Set(withBird.map((e) => e.huntedOn)).size;
  const note = rows.length ? `From ${plural(daysWithBird, 'hunt day')}${loggedDays < daysWithBird ? `, ${loggedDays} with a bird logged` : ''}` : '';
  return {
    rows, daysWithBird, insight, note,
    a11y: `What you hunted. ${insight}`,
    table: { headers: ['Bird', 'Days', 'Share'], rows: rows.map((r) => [r.label, String(r.days), `${r.pct}%`]) },
    woodcockNote: sep ? null : 'Woodcock is grouped with grouse until the app can log it as its own bird.',
    variety: rows.length,
  };
}

// --- 4. Flushes per hour -------------------------------------------------------

export interface FlushPoint {
  entryId: string;
  ymd: Ymd;
  rate: number;
  flushes: number;
  hours: number;
  place: string | null;
  weather: string | null;
  /** 3-hunt moving average ending at this hunt. */
  trend: number;
}
export interface FlushChart {
  points: FlushPoint[];
  avg: number;
  best: FlushPoint | null;
  included: number;
  total: number;
  insight: string;
  a11y: string;
  table: Table;
  note: string;
}

export function flushRateFor(hunts: Hunt[]): FlushChart {
  const withHours = hunts.filter((e) => hoursOf(e) > 0).sort((a, b) => a.huntedOn.localeCompare(b.huntedOn) || a.createdAt.localeCompare(b.createdAt));
  const rates = withHours.map((e) => flushesOf(e) / hoursOf(e));
  const points: FlushPoint[] = withHours.map((e, i) => {
    const w = e.details?.weather;
    const weather = w ? [w.tempF !== null ? `${w.tempF}°F` : null, w.windMph !== null ? `wind ${w.windMph} mph` : null].filter(Boolean).join(', ') : '';
    const win = rates.slice(Math.max(0, i - 2), i + 1);
    return { entryId: e.id, ymd: e.huntedOn, rate: rates[i], flushes: flushesOf(e), hours: hoursOf(e), place: placeOf(e), weather: weather || null, trend: sumBy(win, (r) => r) / win.length };
  });
  const hrs = sumBy(withHours, hoursOf);
  const avg = hrs > 0 ? sumBy(withHours, flushesOf) / hrs : 0;
  const best = points.reduce<FlushPoint | null>((b, p) => (!b || p.rate > b.rate ? p : b), null);
  let insight = 'Log hours on your hunts to see flushes per hour.';
  if (points.length) {
    insight = `Your hunts averaged ${fmtNum(avg)} flushes an hour.`;
    if (best && points.length >= 3) insight += ` Your best was ${fmtNum(best.rate)} on ${formatDay(best.ymd).split(', ')[1]}`;
    const months = new Map<string, number[]>();
    for (const p of points) months.set(p.ymd.slice(0, 7), [...(months.get(p.ymd.slice(0, 7)) ?? []), p.rate]);
    const above = [...months.entries()]
      .filter(([, r]) => r.length >= 3 && sumBy(r, (x) => x) / r.length > avg)
      .map(([k]) => k)
      .sort()
      .pop();
    if (best && points.length >= 3) insight += above ? `, and ${monthLong(above)} stayed above average.` : '.';
  }
  const left = hunts.length - points.length;
  return {
    points, avg, best, included: points.length, total: hunts.length, insight,
    a11y: `Flushes per hour. ${insight}`,
    table: { headers: ['Date', 'Flushes', 'Hours', 'Per hour'], rows: points.map((p) => [formatDay(p.ymd), String(p.flushes), fmtNum(p.hours), fmtNum(p.rate)]) },
    note: `Shows ${points.length} of ${plural(hunts.length, 'hunt')}.${left > 0 ? ` ${left} ${left === 1 ? 'has' : 'have'} no hours logged, so ${left === 1 ? 'it is' : 'they are'} left out. Add hours in the diary to include ${left === 1 ? 'it' : 'them'}.` : ''}`,
  };
}

// --- 5. Places -----------------------------------------------------------------

export interface PlaceRow {
  key: string;
  label: string;
  days: number;
  isNew: boolean;
  entryIds: string[];
}
export interface PlacesChart {
  rows: PlaceRow[];
  counties: { name: string; days: number }[];
  gameLands: number;
  noCounty: number;
  insight: string;
  a11y: string;
  table: Table;
  note: string | null;
}

/** Stable key for "the same place": the SGL number for game lands, else the typed name. */
export const placeKeyOf = (e: JournalEntry, lookup: PlaceLookup) => gameLandOf(e, lookup) ?? placeOf(e)?.toLowerCase() ?? null;

export function placesFor(all: JournalEntry[], scope: Scope, ctx: Ctx): PlacesChart {
  const hunts = huntsInScope(all, scope);
  const keyOf = (e: Hunt) => placeKeyOf(e, ctx.lookup);
  const firstSeen = new Map<string, Ymd>();
  for (const e of [...dated(all)].sort((a, b) => a.huntedOn.localeCompare(b.huntedOn))) {
    const k = keyOf(e);
    if (k && !firstSeen.has(k)) firstSeen.set(k, e.huntedOn);
  }
  const hadEarlier = scope !== ALL_TIME && dated(all).some((e) => seasonOf(e.huntedOn) < scope);
  const byKey = new Map<string, { label: string; days: Set<string>; ids: string[] }>();
  for (const e of hunts) {
    const k = keyOf(e);
    if (!k) continue;
    const v = byKey.get(k) ?? { label: placeOf(e) ?? k, days: new Set<string>(), ids: [] };
    v.days.add(e.huntedOn);
    v.ids.push(e.id);
    byKey.set(k, v);
  }
  const rows: PlaceRow[] = [...byKey.entries()]
    .map(([key, v]) => ({ key, label: v.label, days: v.days.size, entryIds: v.ids, isNew: hadEarlier && seasonOf(firstSeen.get(key) ?? '') === scope }))
    .sort((a, b) => b.days - a.days || a.label.localeCompare(b.label));
  const cdays = new Map<string, Set<string>>();
  for (const e of hunts) for (const c of countiesOf(e, ctx.lookup)) cdays.set(c, (cdays.get(c) ?? new Set()).add(e.huntedOn));
  const counties = [...cdays.entries()].map(([name, d]) => ({ name, days: d.size })).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
  const gameLands = new Set(hunts.map((e) => gameLandOf(e, ctx.lookup)).filter(Boolean)).size;
  const noCounty = hunts.filter((e) => placeOf(e) && !countiesOf(e, ctx.lookup).length).length;
  const when = scope === ALL_TIME ? 'so far' : 'this season';
  let insight: string;
  if (!rows.length) insight = 'Add a place to your hunts to see where you went.';
  else {
    const head = gameLands
      ? `${plural(gameLands, 'game land')}${counties.length ? ` in ${plural(counties.length, 'county', 'counties')}` : ''} ${when}.`
      : `${plural(rows.length, 'place')} ${when}.`;
    const fresh = rows.filter((r) => r.isNew && r.key.startsWith('SGL ')).map((r) => r.key);
    const tail = fresh.length > 2 ? ` ${fresh.length} game lands were new to you.` : fresh.length ? ` ${fresh.length === 1 ? `${fresh[0]} was` : `${fresh.slice(0, -1).join(', ')} and ${fresh[fresh.length - 1]} were`} new to you.` : '';
    insight = head + tail;
  }
  return {
    rows, counties, gameLands, noCounty, insight, a11y: `Places. ${insight}`,
    table: { headers: ['Place', 'Days'], rows: rows.map((r) => [r.label, String(r.days)]) },
    note: noCounty ? `${plural(noCounty, 'hunt')} at places with no county ${noCounty === 1 ? 'is' : 'are'} not counted in counties.` : null,
  };
}

// --- 6. Dog work ---------------------------------------------------------------

export interface DogRow {
  dogId: string;
  name: string;
  breed: string | null;
  hunts: number;
  points: number;
  flushes: number;
  retrieves: number;
  /** Per hunt; null until the dog has 3 hunts. */
  perHunt: { points: number; flushes: number; retrieves: number } | null;
  isNew: boolean;
}
export interface DogChart {
  rows: DogRow[];
  insight: string;
  a11y: string;
  table: Table;
}

export function dogsFor(all: JournalEntry[], scope: Scope, ctx: Ctx): DogChart {
  const hunts = huntsInScope(all, scope);
  const earlier = new Set<string>();
  const hadEarlier = scope !== ALL_TIME && dated(all).some((e) => seasonOf(e.huntedOn) < scope);
  if (scope !== ALL_TIME) for (const e of dated(all)) if (seasonOf(e.huntedOn) < scope) for (const d of e.details?.dogs ?? []) earlier.add(d.dogId);
  const by = new Map<string, DogRow>();
  for (const e of [...hunts].sort((a, b) => a.huntedOn.localeCompare(b.huntedOn))) {
    for (const d of e.details?.dogs ?? []) {
      const r = by.get(d.dogId) ?? { dogId: d.dogId, name: d.name, breed: ctx.roster.find((x) => x.id === d.dogId)?.breed ?? null, hunts: 0, points: 0, flushes: 0, retrieves: 0, perHunt: null, isNew: hadEarlier && !earlier.has(d.dogId) };
      r.hunts++;
      r.points += d.points;
      r.flushes += d.flushes;
      r.retrieves += d.retrieves;
      r.name = d.name;
      by.set(d.dogId, r);
    }
  }
  const rows = [...by.values()]
    .map((r) => ({ ...r, perHunt: r.hunts >= 3 ? { points: r.points / r.hunts, flushes: r.flushes / r.hunts, retrieves: r.retrieves / r.hunts } : null }))
    .sort((a, b) => b.points - a.points || b.hunts - a.hunts || a.name.localeCompare(b.name));
  let insight = '';
  if (rows.length) {
    const t = rows[0];
    insight = t.points > 0
      ? `${t.name} had ${plural(t.points, 'point')} in ${plural(t.hunts, 'hunt')}${t.perHunt ? `, ${fmtNum(t.perHunt.points)} per hunt` : ''}.`
      : `${t.name} went on ${plural(t.hunts, 'hunt')}.`;
    const fresh = rows.filter((r) => r.isNew).map((r) => r.name);
    if (fresh.length) insight += ` ${fresh.join(' and ')} ${fresh.length === 1 ? 'is' : 'are'} new this season.`;
  }
  return {
    rows, insight,
    a11y: `Dog work. ${insight}`,
    table: { headers: ['Dog', 'Hunts', 'Points', 'Flushes', 'Retrieves'], rows: rows.map((r) => [r.name, String(r.hunts), String(r.points), String(r.flushes), String(r.retrieves)]) },
  };
}

// --- Bests ---------------------------------------------------------------------

export interface Best {
  key: string;
  label: string;
  value: string;
  /** Shown in the app only; never on a share card. */
  date: Ymd;
}

export function bestsFor(hunts: Hunt[]): Best[] {
  if (hunts.length < 5) return [];
  const days = new Map<Ymd, { flushes: number; hours: number; miles: number; points: number }>();
  for (const e of hunts) {
    const d = days.get(e.huntedOn) ?? { flushes: 0, hours: 0, miles: 0, points: 0 };
    d.flushes += flushesOf(e);
    d.hours += hoursOf(e);
    d.miles += milesOf(e);
    d.points += dogPointsOf(e);
    days.set(e.huntedOn, d);
  }
  const top = (f: (d: { flushes: number; hours: number; miles: number; points: number }) => number) => {
    let best: [Ymd, number] | null = null;
    for (const [ymd, d] of [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]))) if (f(d) > (best?.[1] ?? 0)) best = [ymd, f(d)];
    return best;
  };
  const out: Best[] = [];
  const fl = top((d) => d.flushes);
  if (fl) out.push({ key: 'flushes', label: 'Most flushes in a day', value: String(fl[1]), date: fl[0] });
  const hr = top((d) => d.hours);
  if (hr) out.push({ key: 'hours', label: 'Longest day afield', value: `${fmtNum(hr[1])} h`, date: hr[0] });
  const mi = top((d) => d.miles);
  if (mi) out.push({ key: 'miles', label: 'Longest walk', value: `${fmtNum(mi[1])} mi`, date: mi[0] });
  const dg = top((d) => d.points);
  if (dg) out.push({ key: 'dog', label: 'Best dog day', value: `${dg[1]} ${dg[1] === 1 ? 'point' : 'points'}`, date: dg[0] });
  return out;
}

// --- Everything for one screen -------------------------------------------------

export type StatsState = 'empty' | 'few' | 'ready';

export interface StatsModel {
  scope: Scope;
  state: StatsState;
  hunts: number;
  tiles: Tiles;
  days: DaysByMonth;
  calendar: Calendar | null;
  species: SpeciesChart;
  flush: FlushChart | null;
  places: PlacesChart;
  dogs: DogChart | null;
  bests: Best[];
  gates: { days: Gate; calendar: Gate; species: Gate; flush: Gate; places: Gate };
}

export function buildStats(entries: JournalEntry[], scope: Scope, ctx: Ctx): StatsModel {
  const hunts = huntsInScope(entries, scope);
  const c = ctx;
  const withSpecies = hunts.filter((e) => speciesOf(e).length).length;
  const withHours = hunts.filter((e) => hoursOf(e) > 0).length;
  const withPlace = hunts.filter((e) => placeOf(e)).length;
  const withDog = hunts.filter((e) => e.details?.dogs.length).length;
  const state: StatsState = !hunts.length ? 'empty' : hunts.length < 3 ? 'few' : 'ready';
  const dogs = withDog ? dogsFor(entries, scope, c) : null;
  return {
    scope,
    state,
    hunts: hunts.length,
    tiles: tilesFor(hunts, c.lookup),
    days: daysByMonth(entries, scope, c),
    calendar: scope === ALL_TIME ? null : calendarFor(entries, scope, c),
    species: speciesFor(hunts, c),
    flush: scope === ALL_TIME ? null : flushRateFor(hunts),
    places: placesFor(entries, scope, c),
    dogs,
    bests: bestsFor(hunts),
    gates: {
      days: gate(hunts.length, 1, () => 'Log a hunt to unlock this chart.'),
      calendar: gate(hunts.length, 1, () => 'Log a hunt to unlock this chart.'),
      species: gate(withSpecies, 3, (n) => `Log a bird on ${plural(n, 'more hunt')} to unlock this chart.`),
      flush: gate(withHours, 3, (n) => `Log hours on ${plural(n, 'more hunt')} to unlock this chart.`),
      places: gate(withPlace, 1, () => 'Add a place to a hunt to unlock this chart.'),
    },
  };
}

// --- Share card (aggregates only; flag-gated in the UI) ------------------------

export interface ShareCard {
  seasonLabel: string;
  days: number;
  flushes: number;
  hours: number;
  gameLands: number;
  varietyCount: number;
  /** One bar per month; the first letter only. No dates. */
  months: { letter: string; days: number }[];
  /** "Feb": the month of the last day the card covers. Month only, never a date. */
  through: string | null;
  /** Hunts left out because they are still inside the posting delay. */
  heldBack: number;
}

/**
 * A hunt day goes on a share card only once it is over and the same delay that
 * holds shared posts (public.min_public_delay) has passed: the later of the next
 * midnight ET or 12 hours after the entry was saved (publicAfterET), and never before
 * the hunt day has ended.
 */
export function shareEligible(e: Hunt, now: Date): boolean {
  const created = new Date(Date.parse(e.createdAt) || 0);
  const ready = Math.max(publicAfterET(created).getTime(), midnightET(addDays(e.huntedOn, 1)).getTime());
  return now.getTime() >= ready;
}

export function buildShareCard(entries: JournalEntry[], season: string, ctx: Ctx, now: Date = new Date()): ShareCard {
  const all = huntsInScope(entries, season);
  const hunts = all.filter((e) => shareEligible(e, now));
  const days = daysByMonth(hunts, season, ctx);
  const latest = hunts.map((e) => e.huntedOn).sort().pop();
  return {
    seasonLabel: seasonLabel(season),
    days: new Set(hunts.map((e) => e.huntedOn)).size,
    flushes: sumBy(hunts, flushesOf),
    hours: Math.round(sumBy(hunts, hoursOf) * 10) / 10,
    gameLands: new Set(hunts.map((e) => gameLandOf(e, ctx.lookup)).filter(Boolean)).size,
    varietyCount: new Set(hunts.flatMap((e) => speciesOf(e).map((s) => bucketOf(s, true)))).size,
    months: days.bars.map((b) => ({ letter: b.label[0], days: b.days })),
    through: latest ? monthShort(latest) : null,
    heldBack: all.length - hunts.length,
  };
}
