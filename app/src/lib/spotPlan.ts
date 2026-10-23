import { legalHours, seasons, speciesStatus, type SpeciesStatus } from '@/data/seasons';
import { speciesLabel, type LngLat, type Place, type Species } from '@/data/types';
import { officialDay } from '@/lib/sun';
import { addDays, formatDay, formatTime, midnightET, todayET, weekdayOf, type Ymd } from '@/lib/time';

/** The bits of a place these helpers need (a Place or a saved plan's snapshot). */
export type SpotLike = Pick<Place, 'id' | 'name' | 'type' | 'species' | 'center' | 'access'> & { note?: string; parking?: LngLat | null };

/**
 * Pure helpers for the spot detail redesign (spot-detail/spec.md): open-species
 * tags, "What you can hunt here" groups, Plan a hunt days and reminders,
 * directions targets. Everything is computed on the phone so it works offline.
 */

/** End of the 2026-27 license year (PA licenses run Jul 1 – Jun 30). */
export const LICENSE_YEAR_END: Ymd = '2027-06-30';
export const PLAN_NOTES_MAX = 500;
export const FORECAST_DAYS = 7;
export const SEASON_FOOTER = 'Season dates: PGC 2026-27 digest. Check WMU rules before you hunt.';

/** Approved upland/dove species shown in What to hunt (waterfowl is out of scope for v1). */
export const HUNT_SPECIES: Species[] = ['pheasant', 'grouse', 'woodcock', 'dove', 'turkey'];

/**
 * Species legal to hunt at a spot. `place.species` comes from the source layer
 * (the PGC stocking layer only ever lists pheasant, dove fields only dove), so it
 * says what a spot is managed/stocked for, NOT everything you may hunt there.
 * All spots in the app are public or enrolled hunting land, so every approved
 * species is huntable; `place.species` only drives "Good fit".
 */
export const huntSpecies = (_place: SpotLike): Species[] => HUNT_SPECIES;

const FOREST = /forest|wood|hardwood|ridge|aspen|thicket|laurel|oak|timber|cover|plateau|mountain/i;
const FIELD = /field|grass|corn|hedgerow|crop|meadow|sunflower|wheat|farm|bottom/i;
const WET = /creek|stream|marsh|wet|alder|bottom/i;

/** Habitat-based good fit for species the source layer doesn't list. */
function habitatFit(place: SpotLike & { note?: string }, sp: Species): string | null {
  const note = place.note ?? '';
  switch (sp) {
    case 'grouse':
      if (place.type === 'game_land' || FOREST.test(note)) return 'Forest and young-growth cover suits grouse';
      return null;
    case 'turkey':
      if (place.type === 'game_land' || FOREST.test(note)) return 'Mixed woods and edges hold fall flocks';
      return null;
    case 'woodcock':
      if (WET.test(note) || /aspen|alder|young|thicket/i.test(note)) return 'Moist thickets and young growth draw woodcock';
      return null;
    case 'dove':
      if (FIELD.test(note) && /sunflower|wheat|crop|corn|cut/i.test(note)) return 'Crop fields draw doves';
      return null;
    case 'pheasant':
      if (place.type !== 'game_land' && FIELD.test(note)) return 'Grass and field edges suit pheasant';
      return null;
  }
  return null;
}

const isOpen = (s: SpeciesStatus) => s.kind === 'open' && !s.season.youth;

/** Species open (general season) at a place on a date, in place order. */
export function openSpecies(place: SpotLike, ymd: Ymd): Species[] {
  return huntSpecies(place).filter((sp) => isOpen(speciesStatus(sp, ymd, place.center)));
}

/** Peek tags: at most two open species, then "+n". */
export function openTags(open: Species[]): string[] {
  const tags = open.slice(0, 2).map((s) => `${speciesLabel[s]} open`);
  if (open.length > 2) tags.push(`+${open.length - 2}`);
  return tags;
}

/** "6:54 AM – 6:11 PM" small-game legal hours for a place and date, or null when the table has no row. */
export function hoursText(place: SpotLike, ymd: Ymd, hours: 'smallGame' | 'migratory' = 'smallGame'): string | null {
  const h = legalHours(hours, ymd, place.center.lng);
  return h ? `${formatTime(h.start)} – ${formatTime(h.end)}` : null;
}

export function sunText(place: SpotLike, ymd: Ymd): string | null {
  const d = officialDay(ymd, place.center.lng);
  return d ? `Sunrise ${formatTime(d.sunrise)} · Sunset ${formatTime(d.sunset)}` : null;
}

/** "Today: 2 species open" row text. */
export function todayRow(place: SpotLike, ymd: Ymd) {
  const open = openSpecies(place, ymd);
  const hours = hoursText(place, ymd);
  return {
    title: open.length === 0 ? 'Today: nothing open' : `Today: ${open.length} species open`,
    detail: [open.map((s) => speciesLabel[s]).join(', '), hours && `legal hours ${hours}`].filter(Boolean).join(' · '),
  };
}

const weekdayShort = (ymd: Ymd) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekdayOf(ymd)];
const mdFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
/** "Nov 8" */
export const shortDate = (ymd: Ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return mdFmt.format(new Date(Date.UTC(y, m - 1, d, 12)));
};
export { formatDay };

/** Last day of the window containing ymd (null if none). */
function windowEnd(species: Species, ymd: Ymd): Ymd | null {
  for (const s of seasons) {
    if (s.species !== species || s.youth) continue;
    for (const [a, b] of s.windows ?? []) if (ymd >= a && ymd <= b) return b;
  }
  return null;
}

/** Next general (non-youth) season start after ymd. */
function nextGeneralOpen(species: Species, ymd: Ymd): Ymd | null {
  let best: Ymd | null = null;
  for (const s of seasons) {
    if (s.species !== species || s.youth) continue;
    for (const [a] of s.windows ?? []) if (a > ymd && (!best || a < best)) best = a;
  }
  return best;
}

/** Row tag: Open / Opens Sat / Closes Nov 8 / Closed. Closes shows within 14 days of the end. */
export function statusTag(species: Species, place: SpotLike, ymd: Ymd): { text: string; tone: 'open' | 'soon' | 'closed' } {
  const st = speciesStatus(species, ymd, place.center);
  if (isOpen(st)) {
    const end = windowEnd(species, ymd);
    if (end && end <= addDays(ymd, 14)) return { text: `Closes ${shortDate(end)}`, tone: 'soon' };
    return { text: 'Open', tone: 'open' };
  }
  if (st.kind === 'sunday') return { text: 'Closed Sun', tone: 'closed' };
  const d = st.kind === 'closed' ? nextGeneralOpen(species, ymd) : null;
  if (d) {
    return { text: d <= addDays(ymd, 6) ? `Opens ${weekdayShort(d)}` : `Opens ${shortDate(d)}`, tone: 'soon' };
  }
  if (st.kind === 'check') return { text: 'Check digest', tone: 'closed' };
  return { text: 'Closed', tone: 'closed' };
}

/** Every general-season segment for a species, e.g. "Oct 24 – Dec 24, Dec 26 – Feb 28". */
export function seasonDates(species: Species): string {
  const parts: string[] = [];
  for (const s of seasons) {
    if (s.species !== species || s.youth) continue;
    if (!s.windows) parts.push('dates vary, check the digest');
    for (const [a, b] of s.windows ?? []) parts.push(`${shortDate(a)} – ${shortDate(b)}`);
  }
  return parts.join(', ');
}

/** Season note minus bag/limit sentences (the spec shows no bag limits). */
const seasonNote = (species: Species) => {
  const note = seasons.find((s) => s.species === species && !s.youth && s.note)?.note;
  const kept = (note ?? '').split(/(?<=\.)\s+/).filter((x) => x && !/limit/i.test(x)).join(' ');
  return kept || undefined;
};

const possibleReason = (place: SpotLike, species: Species): string => {
  if (place.type === 'stocking') return species === 'pheasant' ? 'Allowed here; not stocked' : 'Not stocked; wild birds possible in nearby cover';
  if (place.type === 'dove_field') return 'Allowed here; field is managed for doves';
  return 'Allowed on game lands; habitat varies';
};
/** Good-fit reason, or null when the species is only "Possible" here. */
const goodReason = (place: SpotLike, species: Species): string | null => {
  if (place.type === 'stocking' && place.species.includes(species)) return 'PGC stocks this property';
  if (place.type === 'dove_field' && species === 'dove') return 'Managed dove field';
  if (place.species.includes(species)) return 'Listed for this spot';
  return habitatFit(place, species);
};

export interface HuntRow {
  species: Species;
  reason: string;
  dates: string;
  tag: ReturnType<typeof statusTag>;
  note?: string;
}

/** "Good fit here" / "Possible" groups for What you can hunt here. No bag limits by design. */
export function whatToHunt(place: SpotLike, ymd: Ymd): { good: HuntRow[]; possible: HuntRow[] } {
  const all = huntSpecies(place);
  const reasons = new Map(all.map((sp) => [sp, goodReason(place, sp)] as const));
  const goodSet = new Set<Species>(all.filter((sp) => reasons.get(sp)));
  const row = (sp: Species, good: boolean): HuntRow => ({
    species: sp,
    reason: good ? reasons.get(sp)! : possibleReason(place, sp),
    dates: seasonDates(sp),
    tag: statusTag(sp, place, ymd),
    note: seasonNote(sp),
  });
  return {
    good: all.filter((s) => goodSet.has(s)).map((s) => row(s, true)),
    possible: all.filter((s) => !goodSet.has(s)).map((s) => row(s, false)),
  };
}

/** Next 5 days for the Plan step 1 chips, starting today. */
export const nextDays = (today: Ymd, n = 5): Ymd[] => Array.from({ length: n }, (_, i) => addDays(today, i));
export const dayChipLabel = (ymd: Ymd, today: Ymd) =>
  ymd === today ? 'Today' : ymd === addDays(today, 1) ? 'Tomorrow' : `${weekdayShort(ymd)} ${Number(ymd.slice(8))}`;

export const forecastAvailable = (ymd: Ymd, today: Ymd) => ymd >= today && ymd <= addDays(today, FORECAST_DAYS - 1);

export interface SpeciesChoice {
  species: Species;
  open: boolean;
  /** "Opens Nov 21" for disabled chips. */
  hint?: string;
}

/** Species chips for a plan date: only species fitting this spot; closed ones carry their open date. */
export function speciesChoices(place: SpotLike, ymd: Ymd): SpeciesChoice[] {
  return huntSpecies(place).map((species) => {
    const st = speciesStatus(species, ymd, place.center);
    if (isOpen(st)) return { species, open: true };
    const next = st.kind === 'closed' ? nextGeneralOpen(species, ymd) : null;
    if (next) return { species, open: false, hint: `Opens ${shortDate(next)}` };
    if (st.kind === 'sunday') return { species, open: false, hint: 'Closed Sundays' };
    return { species, open: false, hint: 'Closed' };
  });
}

/** Next date on/after ymd when anything here is open (searches to the license year end). */
export function nextOpenDate(place: SpotLike, ymd: Ymd): Ymd | null {
  for (let d = addDays(ymd, 1); d <= LICENSE_YEAR_END; d = addDays(d, 1)) if (openSpecies(place, d).length) return d;
  return null;
}

/** True when none of the planned species is open on the planned date (season closed / changed). */
export function planSeasonClosed(place: Pick<Place, 'center'>, ymd: Ymd, species: Species[]): boolean {
  return species.length > 0 && !species.some((s) => isOpen(speciesStatus(s, ymd, place.center)));
}

export type Reminder = 'none' | 'night_before_8pm' | 'hour_before_legal';
export const reminderLabel: Record<Reminder, string> = {
  none: 'None',
  night_before_8pm: 'Night before at 8 PM',
  hour_before_legal: '1 hr before legal hours',
};

/** When a reminder should fire, or null for none / no hours row. */
export function reminderAt(reminder: Reminder, ymd: Ymd, center: LngLat): Date | null {
  if (reminder === 'none') return null;
  // 8 PM ET the night before = 4 h before the date's ET midnight.
  if (reminder === 'night_before_8pm') return new Date(midnightET(ymd).getTime() - 4 * 3600_000);
  const h = legalHours('smallGame', ymd, center.lng);
  return h ? new Date(h.start.getTime() - 3600_000) : null;
}

/** Directions target: the parking point when we have one, else the place point (nearest access). */
export function directionsTarget(place: Pick<SpotLike, 'center' | 'parking'>): LngLat {
  return place.parking ?? place.center;
}

export function directionsUrls(to: LngLat, label: string) {
  const q = encodeURIComponent(label);
  return {
    apple: `https://maps.apple.com/?daddr=${to.lat},${to.lng}&q=${q}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`,
    waze: `https://waze.com/ul?ll=${to.lat},${to.lng}&navigate=yes`,
  };
}

export const coordsText = (p: LngLat) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
export { todayET };
