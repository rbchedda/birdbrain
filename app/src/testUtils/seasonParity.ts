/**
 * Serializes every season-driven output for one ET day, using only public APIs whose signatures
 * predate the SEASONS registry. seasonParity.test.ts compares a hash per day of 2026-27 against
 * fixtures/season-2026-27-parity.json, captured from the pre-registry code (dev aed0ffd).
 */
import { badgeFor, comingUp, inSeasonRows, segmentsFor } from '@/data/guide';
import { samplePlaces } from '@/data/places';
import { sundayAllowed } from '@/data/regs';
import { describeStatus, legalHours, placeToday, seasons, seasonWindows, speciesStatus, type SpeciesStatus } from '@/data/seasons';
import { searchBirds, seasonTag } from '@/data/speciesSearch';
import { allSpecies } from '@/data/types';
import {
  HUNT_SPECIES,
  nextOpenDate,
  openSpecies,
  planSeasonClosed,
  seasonDates,
  speciesChoices,
  statusTag,
  todayRow,
  whatToHunt,
} from '@/lib/spotPlan';
import { addDays, type Ymd } from '@/lib/time';

const LNGS = [-75.2, -77.5, -80.1];
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const st = (s: SpeciesStatus) =>
  s.kind === 'open'
    ? { k: s.kind, l: s.season.label, y: !!s.season.youth, a: iso(s.start), b: iso(s.end) }
    : s.kind === 'closed'
      ? { k: s.kind, n: s.nextOpen ? [s.nextOpen.date, s.nextOpen.season.label] : null }
      : { k: s.kind, l: (s as { season?: { label: string } }).season?.label ?? null };

export function snapshotDay(ymd: Ymd) {
  const noon = new Date(`${ymd}T17:00:00Z`);
  const late = new Date(`${ymd}T23:30:00Z`);
  const out: Record<string, unknown> = {};
  out.status = LNGS.map((lng) =>
    allSpecies.map((sp) => {
      const s = speciesStatus(sp, ymd, { lat: 40.5, lng });
      return [st(s), describeStatus(s, noon), describeStatus(s, late), badgeFor(s, ymd)];
    }),
  );
  out.hours = LNGS.map((lng) => (['smallGame', 'migratory', 'springTurkey'] as const).map((h) => {
    const r = legalHours(h, ymd, lng);
    return r ? [iso(r.start), iso(r.end)] : null;
  }));
  out.places = samplePlaces.map((p) => {
    const t = placeToday(p, noon);
    const row = todayRow(p, ymd);
    return {
      id: p.id,
      open: t.open,
      st: t.statuses.map((s) => [s.species, st(s.status)]),
      openSp: openSpecies(p, ymd),
      tags: HUNT_SPECIES.map((sp) => statusTag(sp, p, ymd)),
      choices: speciesChoices(p, ymd),
      next: nextOpenDate(p, ymd),
      planClosed: planSeasonClosed(p, ymd, ['pheasant']),
      hunt: whatToHunt(p, ymd),
      // The Today row intentionally changes only when nothing is open (legal hours hidden).
      today: row.title === 'Today: nothing open' ? null : row,
    };
  });
  out.search = searchBirds.map((b) => seasonTag(b.key, ymd, { lat: 40.5, lng: -77.5 }));
  out.guide = [inSeasonRows(ymd, 3, noon).map((r) => [r.species, r.badge, r.detail]), comingUp(ymd, 3, noon)];
  out.segments = allSpecies.map((sp) => segmentsFor(sp, ymd).map((s) => [s.label, s.windows]));
  out.dates = HUNT_SPECIES.map((sp) => seasonDates(sp, ymd));
  out.windows = seasons.map((s) => seasonWindows(s, ymd));
  out.sunday = allSpecies.map((sp) => sundayAllowed(sp, ymd, { county: 'Chester', stateParkOrPreserve: true }));
  return out;
}

export function seasonDays(from: Ymd = '2026-07-01', to: Ymd = '2027-06-30'): Ymd[] {
  const days: Ymd[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}
