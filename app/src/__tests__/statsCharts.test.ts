import { ALL_TIME, buildShareCard, buildStats, huntsInScope, prevSeason, seasonsWithHunts, type Ctx } from '@/data/statsCharts';
import { SAMPLE_NOW, SAMPLE_SEASON, SAMPLE_TODAY, sampleEntries, sampleLookup, sampleRoster } from '@/data/statsSample';
import type { JournalEntry } from '@/data/journal';
import { flags } from '@/lib/flags';

const ctx: Ctx = { lookup: sampleLookup, roster: sampleRoster, today: SAMPLE_TODAY, woodcockSeparate: false, compareLast: true };
const sample = sampleEntries();

function hunt(over: Partial<JournalEntry> & { huntedOn: string }): JournalEntry {
  const base = sample[0];
  return { ...base, id: over.huntedOn + (over.caption ?? ''), clientId: over.huntedOn + (over.caption ?? ''), caption: '', details: undefined, placeCounts: [], species: null, ...over } as JournalEntry;
}

describe('aggregations (sample data)', () => {
  const m = buildStats(sample, SAMPLE_SEASON, ctx);
  it('matches the mockup headline figures', () => {
    expect(m.state).toBe('ready');
    expect(m.hunts).toBe(30);
    expect(m.tiles).toEqual({ days: 30, flushes: 118, hours: 96, gameLands: 9 });
  });
  it('days by month: current vs last season, Sep to Feb', () => {
    expect(m.days.bars.map((b) => b.days).slice(0, 6)).toEqual([3, 7, 9, 6, 4, 1]);
    expect(m.days.bars.map((b) => b.last).slice(0, 6)).toEqual([2, 6, 7, 5, 3, 1]);
    expect(m.days.table.rows.length).toBeGreaterThanOrEqual(6);
  });
  it('never includes coordinates, and the chart models carry text summaries and source notes', () => {
    const json = JSON.stringify(m);
    expect(json).not.toMatch(/"(lat|lng|latitude|longitude|exact)"/);
    for (const c of [m.days, m.species, m.flush!, m.places]) {
      expect(c.insight.length).toBeGreaterThan(10);
      expect(c.a11y.length).toBeGreaterThan(10);
      expect(c.note ?? 'x').toBeTruthy();
      expect(c.table.rows.length).toBeGreaterThan(0);
    }
  });
  it('has no "birds in hand" chart', () => {
    expect(Object.keys(m)).not.toContain('birds');
    expect(JSON.stringify(m.gates)).not.toMatch(/birds/i);
  });
  it('flush rate has a moving average and a season average', () => {
    expect(m.flush!.points.length).toBeGreaterThan(5);
    expect(m.flush!.avg).toBeGreaterThan(0);
    expect(m.flush!.points[2].trend).toBeCloseTo((m.flush!.points[0].rate + m.flush!.points[1].rate + m.flush!.points[2].rate) / 3, 5);
  });
  it('bests appear from five hunts', () => {
    expect(m.bests.length).toBeGreaterThan(0);
    const few = buildStats(sample.slice(0, 4), SAMPLE_SEASON, ctx);
    expect(few.bests).toHaveLength(0);
  });
  it('"count each day once" never exceeds the days afield', () => {
    const once = buildStats(sample, SAMPLE_SEASON, ctx);
    expect(once.species.rows.every((r) => r.days <= 30)).toBe(true);
  });
});

describe('season filter', () => {
  it('splits seasons on Jul 1 (America/New_York)', () => {
    const es = [hunt({ huntedOn: '2026-06-30' }), hunt({ huntedOn: '2026-07-01' }), hunt({ huntedOn: '2027-02-01' })];
    expect(huntsInScope(es, '2025-26').map((e) => e.huntedOn)).toEqual(['2026-06-30']);
    expect(huntsInScope(es, '2026-27').map((e) => e.huntedOn)).toEqual(['2026-07-01', '2027-02-01']);
    expect(huntsInScope(es, ALL_TIME)).toHaveLength(3);
  });
  it('lists seasons that have hunts, newest first, always including the current one', () => {
    const es = [hunt({ huntedOn: '2024-10-01' }), hunt({ huntedOn: '2025-11-01' })];
    expect(seasonsWithHunts(es, '2026-27').map((x) => x.season)).toEqual(['2026-27', '2025-26', '2024-25']);
    expect(prevSeason('2026-27')).toBe('2025-26');
  });
  it('all time has no calendar or flush trend', () => {
    const m = buildStats(sample, ALL_TIME, ctx);
    expect(m.calendar).toBeNull();
  });
  it('ignores entries with no hunt date', () => {
    expect(huntsInScope([hunt({ huntedOn: '2026-10-01' }), { ...hunt({ huntedOn: 'x' }), huntedOn: null }], ALL_TIME)).toHaveLength(1);
  });
});

describe('empty and few-hunt states', () => {
  it('empty: dashes, locked cards, nothing invented', () => {
    const m = buildStats([], '2026-27', ctx);
    expect(m.state).toBe('empty');
    expect(m.hunts).toBe(0);
    expect(m.tiles).toEqual({ days: 0, flushes: null, hours: null, gameLands: null });
    expect(m.flush?.points ?? []).toHaveLength(0);
    expect(m.dogs).toBeNull();
    expect(Object.values(m.gates).some((g) => g.ready)).toBe(false);
  });
  it('few: one or two hunts show progress toward each locked chart', () => {
    const m = buildStats([hunt({ huntedOn: '2026-10-03' }), hunt({ huntedOn: '2026-10-10' })], '2026-27', ctx);
    expect(m.state).toBe('few');
    expect(m.gates.species.ready).toBe(false);
    expect(m.gates.species.need).toBeGreaterThan(m.gates.species.have);
    expect(m.gates.species.hint).toMatch(/\d/);
    expect(m.tiles.days).toBe(2);
  });
  it('a tile that was never logged shows null, not zero', () => {
    const m = buildStats([hunt({ huntedOn: '2026-10-03' })], '2026-27', ctx);
    expect(m.tiles.hours).toBeNull();
    expect(m.tiles.flushes).toBeNull();
  });
});

describe('woodcock', () => {
  it('shares the grouse bar until woodcock can be logged, then stands alone', () => {
    const es = [hunt({ huntedOn: '2026-10-03', species: 'woodcock' }), hunt({ huntedOn: '2026-10-04', species: 'grouse' }), hunt({ huntedOn: '2026-10-05', species: 'grouse' })];
    const shared = buildStats(es, '2026-27', ctx).species;
    expect(shared.rows.map((r) => r.key)).toEqual(['grouse']);
    expect(shared.woodcockNote).toBeTruthy();
    const apart = buildStats(es, '2026-27', { ...ctx, woodcockSeparate: true }).species;
    expect(apart.rows.map((r) => r.key).sort()).toEqual(['grouse', 'woodcock']);
    expect(apart.woodcockNote).toBeNull();
  });
});

describe('share card (behind a flag, off)', () => {
  it('the flag is off by default', () => {
    expect(flags.statsShare).toBe(false);
    expect(flags.woodcockLog).toBe(false);
  });
  it('carries aggregates and a month only, with no places, dates, bird totals, dogs or coordinates', () => {
    const card = buildShareCard(sample, SAMPLE_SEASON, ctx, SAMPLE_NOW);
    expect(card.through).toBe('Feb');
    const json = JSON.stringify(card);
    for (const bad of ['SGL', 'Ruby', 'lat', 'lng', '2026-0', '2025-1', 'shots', 'harvest', 'weather']) expect(json).not.toContain(bad);
    expect(Object.keys(card).sort()).toEqual(['days', 'flushes', 'gameLands', 'heldBack', 'hours', 'months', 'seasonLabel', 'through', 'varietyCount']);
  });
  it('holds back a hunt until its posting delay has passed', () => {
    const e = hunt({ huntedOn: '2026-10-24', createdAt: '2026-10-24T20:00:00.000Z' });
    expect(buildShareCard([e], '2026-27', ctx, new Date('2026-10-25T02:00:00Z')).heldBack).toBe(1);
    expect(buildShareCard([e], '2026-27', ctx, new Date('2026-10-26T12:00:00Z')).heldBack).toBe(0);
  });
});
