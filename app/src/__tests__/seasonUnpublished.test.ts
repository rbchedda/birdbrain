import { badgeFor, inSeasonRows, segmentsFor, segmentsHeading } from '@/data/guide';
import { samplePlaces } from '@/data/places';
import { sundayAllowed } from '@/data/regs';
import { computeSpotVerdict } from '@/data/spotVerdict';
import { describeStatus, placeToday, rangeLabel, seasonWindows, seasons, speciesStatus } from '@/data/seasons';
import { searchBirds, seasonTag } from '@/data/speciesSearch';
import { allSpecies } from '@/data/types';
import {
  HUNT_SPECIES,
  nextOpenDate,
  planMaxDate,
  planSeasonClosed,
  seasonDates,
  seasonFooter,
  speciesChoices,
  statusTag,
  todayRow,
  unverifiedNote,
  whatToHunt,
} from '@/lib/spotPlan';

const LINE = '2027-28 dates not published yet. Check the PGC hunting digest.';
const at = { lat: 40.5, lng: -77.5 };
const dove = samplePlaces.find((p) => p.id === 'dove-sample-1')!;
const stock = samplePlaces.find((p) => p.id === 'stock-sample-1')!;
const DEFINITE = /\b(Closed|Out of season|closed until|out of season|Closed for the season)\b/;

describe.each(['2027-07-01', '2027-09-15'])('unpublished season on %s', (ymd) => {
  it('status is unpublished with the exact line, never Closed / Out of season', () => {
    for (const sp of allSpecies) {
      const s = speciesStatus(sp, ymd, at);
      expect(s).toEqual({ kind: 'unpublished', year: '2027-28' });
      expect(describeStatus(s)).toBe(LINE);
      expect(badgeFor(s, ymd)).toBe('CHECK');
    }
    for (const p of samplePlaces) {
      for (const sp of HUNT_SPECIES) expect(statusTag(sp, p, ymd).text).not.toMatch(DEFINITE);
      const t = placeToday(p, new Date(`${ymd}T16:00:00Z`));
      expect(t).toMatchObject({ open: false, unpublished: '2027-28' });
    }
    for (const b of searchBirds) expect(seasonTag(b.key, ymd, at)).toEqual({ kind: 'check', label: LINE });
    expect(inSeasonRows(ymd, 3).every((r) => r.badge === 'CHECK' && r.detail === LINE)).toBe(true);
  });

  it('Today row hides legal hours and shows the unpublished line', () => {
    expect(todayRow(dove, ymd)).toEqual({ title: 'Today: season dates not published', detail: LINE });
  });

  it('What to hunt labels last season and dates every range with its year', () => {
    expect(seasonDates('dove', ymd)).toBe('2026-27 (last season): Sep 1, 2026 – Nov 27, 2026, Dec 18, 2026 – Jan 2, 2027');
    expect(seasonFooter(ymd)).toBe(`Season dates shown: PGC 2026-27 (last season) digest. ${LINE}`);
    const rows = [...whatToHunt(stock, ymd).good, ...whatToHunt(stock, ymd).possible];
    expect(rows.every((r) => r.tag.text === 'Dates not published')).toBe(true);
  });

  it('Guide segments are last season, labelled, with years', () => {
    expect(segmentsHeading(ymd)).toBe('2026-27 (last season)');
    expect(segmentsFor('dove', ymd).map((s) => s.label)).toEqual(['Mourning dove']);
    expect(rangeLabel(['2026-09-01', '2026-11-27'], ymd)).toBe('Tue, Sep 1, 2026 – Fri, Nov 27, 2026');
    expect(seasonWindows(seasons.find((s) => s.species === 'dove')!, ymd)[0].label).toBe('Tue, Sep 1, 2026 – Fri, Nov 27, 2026');
  });

  it('Plan never blocks: every species selectable with an unverified-dates note', () => {
    expect(speciesChoices(stock, ymd).every((c) => c.open && c.unverified)).toBe(true);
    expect(planSeasonClosed(stock, ymd, ['pheasant'])).toBe(false);
    expect(unverifiedNote(ymd)).toBe(`Unverified dates. ${LINE}`);
    expect(nextOpenDate(stock, ymd)).toBeNull();
    expect(planMaxDate(ymd)).toBe('2028-06-30');
  });

  it('spot verdict is never Closed; its line leads with the unpublished copy', () => {
    const v = computeSpotVerdict({ place: dove, entries: [], reference: ymd });
    expect(v.word).not.toBe('Closed');
    expect(v.line.startsWith(LINE)).toBe(true);
    expect(computeSpotVerdict({ place: dove, entries: [], reference: '2027-06-15' }).word).toBe('Closed');
  });

  it('SE park Sundays: no published dates, so not allowed', () => {
    expect(sundayAllowed('pheasant', '2027-11-14', { county: 'Chester', stateParkOrPreserve: true })).toBe(false);
  });
});

describe('published season (2026-27)', () => {
  it('Today row keeps legal hours when something is open', () => {
    expect(todayRow(dove, '2026-11-05').detail).toMatch(/legal hours \d/);
  });

  it('nothing open: next known opener instead of legal hours', () => {
    expect(todayRow(dove, '2026-07-15')).toEqual({ title: 'Today: nothing open', detail: 'Next opener: Dove · Tue, Sep 1' });
    expect(todayRow(stock, '2027-03-10')).toEqual({ title: 'Today: nothing open', detail: 'Next opener: Turkey · Sat, May 1' });
  });

  it('after the last 2026-27 opener: the next season is unpublished, said so (no hours)', () => {
    expect(todayRow(stock, '2027-06-15')).toEqual({ title: 'Today: nothing open', detail: LINE });
  });

  it('fall turkey search tag still reads from the season set', () => {
    expect(seasonTag('turkey', '2026-10-30', at).label).toBe('Closed until Sat, Oct 31');
    expect(seasonTag('turkey', '2026-11-01', at).kind).toBe('open');
    expect(seasonTag('turkey', '2026-11-10', at).kind).toBe('check');
    expect(seasonTag('turkey', '2026-12-01', at).label).toBe('Closed for the season');
  });

  it('plan max date stays the 2026-27 license year end', () => {
    expect(planMaxDate('2026-11-05')).toBe('2027-06-30');
  });
});
