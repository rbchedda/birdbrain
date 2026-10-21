import { birds } from '@/data/birds';
import { gear } from '@/data/gear';
import { badgeFor, GUIDE_SECTIONS, hoursZones, inSeasonRows, shootingTimes } from '@/data/guide';
import { regTopics } from '@/data/guideRegs';
import { REGS } from '@/data/regs';
import { speciesStatus } from '@/data/seasons';
import { allSpecies } from '@/data/types';
import { officialHours } from '@/lib/sun';

const norm = (s: string) => s.replace(/[\s\u202f]+/g, ' ');
const row = (rows: ReturnType<typeof inSeasonRows>, sp: string) => rows.find((r) => r.species === sp)!;

describe('Guide: In season now (fixed dates)', () => {
  it('pheasant opener Sat Oct 24, 2026 is OPEN in every zone', () => {
    for (const { zone } of hoursZones()) expect(row(inSeasonRows('2026-10-24', zone), 'pheasant').badge).toBe('OPEN');
  });

  it('closed day before the opener is SOON; out of season with nothing upcoming is CLOSED', () => {
    expect(row(inSeasonRows('2026-10-20', 3), 'pheasant')).toMatchObject({ badge: 'SOON', detail: expect.stringMatching(/opens Sat, Oct 24/) });
    expect(row(inSeasonRows('2026-12-25', 3), 'grouse').badge).toBe('SOON'); // Christmas closure, reopens Dec 26
    expect(row(inSeasonRows('2027-03-15', 3), 'pheasant')).toMatchObject({ badge: 'CLOSED', detail: 'Out of season' });
    expect(row(inSeasonRows('2026-08-01', 3), 'dove').badge).toBe('CLOSED'); // opens Sep 1, more than 14 days away
  });

  it('Sunday Oct 25, 2026: pheasant and grouse OPEN, doves CLOSED (migratory)', () => {
    const rows = inSeasonRows('2026-10-25', 3);
    expect(row(rows, 'pheasant').badge).toBe('OPEN');
    expect(row(rows, 'grouse').badge).toBe('OPEN');
    expect(row(rows, 'dove')).toMatchObject({ badge: 'CLOSED', detail: 'Closed Sundays (migratory birds)' });
    expect(row(rows, 'waterfowl').badge).toBe('CHECK');
  });

  it('uses the same status as the Open Today card (speciesStatus)', () => {
    const lng = hoursZones()[2].lng;
    for (const sp of allSpecies) {
      expect(row(inSeasonRows('2026-11-02', 3), sp).status).toEqual(speciesStatus(sp, '2026-11-02', { lat: 40.5, lng }));
      expect(badgeFor(speciesStatus(sp, '2026-11-02', { lat: 40.5, lng }), '2026-11-02')).toBe(row(inSeasonRows('2026-11-02', 3), sp).badge);
    }
  });
});

describe('Guide: bag limits come from regs.ts', () => {
  it.each([
    ['pheasant', '2 (either sex)', '6'],
    ['grouse', '2', '6'],
    ['dove', '15', '45'],
    ['turkey', expect.stringMatching(/^Fall 1 per season .* spring 1 bearded bird per season$/), 'Season limit'],
    ['waterfowl', 'Varies by species and zone', 'See digest (federal exceptions)'],
  ] as const)('%s', (sp, daily, possession) => {
    expect(REGS.species[sp]).toMatchObject({ daily, possession });
  });
});

describe('Guide: shooting times match the bundled PGC table rows exactly', () => {
  it.each([
    // ymd, zone (+minutes), table row [sunrise, sunset, hunt_start, hunt_end], expected
    ['2026-10-24', 1, ['07:21', '18:08', '06:51', '18:38'], '6:51 AM – 6:38 PM', '6:51 AM – 6:08 PM'],
    ['2026-12-27', 4, ['07:21', '16:42', '06:51', '17:12'], '6:59 AM – 5:20 PM', '6:59 AM – 4:50 PM'],
    ['2027-01-10', 7, ['07:22', '16:54', '06:52', '17:24'], '7:12 AM – 5:44 PM', '7:12 AM – 5:14 PM'],
  ])('%s zone %i', (ymd, zone, tableRow, small, migratory) => {
    expect(officialHours.rows[ymd]).toEqual(tableRow);
    const [today] = shootingTimes(ymd, zone);
    expect(norm(`${today.smallGame!.start} – ${today.smallGame!.end}`)).toBe(small);
    expect(norm(`${today.migratory!.start} – ${today.migratory!.end}`)).toBe(migratory);
  });

  it('lists today plus the next 7 days', () => {
    const rows = shootingTimes('2026-10-21', 3);
    expect(rows.map((r) => r.ymd)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28']);
    expect(rows.find((r) => r.ymd === '2026-10-25')!.sunday).toBe(true);
  });

  it('a date missing from the table gives null (shown as "check the digest"), never a computed time', () => {
    const table = { ...officialHours, rows: {} };
    expect(shootingTimes('2026-10-21', 3, 2, table).map((r) => [r.smallGame, r.migratory])).toEqual([[null, null], [null, null]]);
  });
});

describe('Guide content', () => {
  it('has the six sections in the spec order', () => {
    expect(GUIDE_SECTIONS.map((s) => s.label)).toEqual(['In season', 'Regs', 'Bird ID', 'Gear', 'Bag', 'Hours']);
  });

  it('covers the in-scope birds, with rooster and hen for pheasant', () => {
    expect(birds.map((b) => b.key)).toEqual(['pheasant', 'grouse', 'woodcock', 'dove', 'turkey', 'bobwhite']);
    expect(birds[0].photos.map((p) => p.label)).toEqual(['Rooster', 'Hen']);
    for (const b of birds) {
      expect(b.fieldMarks.length).toBeGreaterThan(0);
      expect(b.lookAlikes.length).toBeGreaterThan(0);
      if (!b.species) expect(b.regsNote).toMatch(/PGC digest/);
    }
  });

  it('gear lists are educational: license on every list, no links or store names', () => {
    for (const items of Object.values(gear)) {
      expect(items[0].label).toMatch(/Hunting license/);
      for (const g of items) expect(g.label).not.toMatch(/https?:|\.com|buy|shop|\$/i);
    }
  });

  it('regulation topics cover orange, Sunday, SGL, licenses and non-toxic shot, each linked to PGC', () => {
    expect(regTopics.map((t) => t.key).sort()).toEqual(['licenses', 'nontoxic', 'orange', 'sgl', 'sunday']);
    for (const t of regTopics) expect(t.url).toMatch(/^https:\/\/www\.pa\.gov\//);
  });
});

describe('grouse field marks', () => {
  it('drumming is the spring courtship/territory display, not the flush', () => {
    const marks = birds.find((b) => b.key === 'grouse')!.fieldMarks;
    const drum = marks.filter((m) => /drum/i.test(m));
    expect(drum).toHaveLength(1);
    expect(drum[0]).toMatch(/spring courtship and territory display/);
    expect(drum[0]).toMatch(/not the flush/);
    expect(marks.some((m) => /drumming flush/i.test(m))).toBe(false);
  });
});
