import { describeStatus, legalHours, seasons, speciesStatus, sundayClosed } from '@/data/seasons';
import { regsFor } from '@/data/regs';
import { allSpecies, loggableSpecies, migratory } from '@/data/types';
import { officialDay, pgcHoursZone } from '@/lib/sun';

// French Creek State Park, about 40.2N 75.8W.
const frenchCreek = { lat: 40.2, lng: -75.8 };

describe('woodcock 2026-27 (digest PDF p.47 / printed p.45)', () => {
  it('runs statewide Oct 17-Dec 8 with migratory hours', () => {
    const wc = seasons.filter((s) => s.species === 'woodcock');
    expect(wc).toHaveLength(1);
    expect(wc[0].windows).toEqual([['2026-10-17', '2026-12-08']]);
    expect(wc[0].hours).toBe('migratory');
    expect(migratory).toContain('woodcock');
    expect(sundayClosed('woodcock')).toBe(true);
    expect(regsFor('woodcock')).toMatchObject({ daily: '3', possession: '9', sunday: 'closed' });
  });

  it('is open on opening-day Saturday and ends at sunset, not ½ hour after', () => {
    const s = speciesStatus('woodcock', '2026-10-24', frenchCreek);
    expect(s.kind).toBe('open');
    if (s.kind !== 'open') return;
    const day = officialDay('2026-10-24', frenchCreek.lng)!;
    expect(s.start).toEqual(day.huntStart);
    expect(s.end).toEqual(day.sunset);
    expect(legalHours('migratory', '2026-10-24', frenchCreek.lng)!.end).toEqual(day.sunset);
  });

  it('is closed on Sundays and outside the season', () => {
    expect(speciesStatus('woodcock', '2026-10-25', frenchCreek).kind).toBe('sunday');
    expect(speciesStatus('woodcock', '2026-10-16', frenchCreek)).toMatchObject({ kind: 'closed', nextOpen: { date: '2026-10-17' } });
    expect(speciesStatus('woodcock', '2026-12-09', frenchCreek)).toMatchObject({ kind: 'closed', nextOpen: null });
    expect(describeStatus(speciesStatus('woodcock', '2026-10-25', frenchCreek))).toBeTruthy();
  });

  it('is shown in the guide but not offered in the hunt log (no DB enum value yet)', () => {
    expect(allSpecies).toContain('woodcock');
    expect(loggableSpecies).not.toContain('woodcock' as never);
  });

  it('is offered for logging only with the woodcockLog flag (needs the hosted migration first)', () => {
    process.env.EXPO_PUBLIC_FLAG_WOODCOCK_LOG = '1';
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const t = require('@/data/types') as typeof import('@/data/types');
        expect(t.loggableSpecies).toContain('woodcock');
      });
    } finally {
      delete process.env.EXPO_PUBLIC_FLAG_WOODCOCK_LOG;
    }
  });
});

describe('pheasant 2026-27 (digest PDF p.42-43 / printed p.40-41)', () => {
  it('has junior Oct 10-18 and statewide Oct 24-Dec 24 & Dec 26-Feb 28', () => {
    const ph = seasons.filter((s) => s.species === 'pheasant');
    expect(ph.find((s) => s.youth)!.windows).toEqual([['2026-10-10', '2026-10-18']]);
    expect(ph.find((s) => !s.youth)!.windows).toEqual([
      ['2026-10-24', '2026-12-24'],
      ['2026-12-26', '2027-02-28'],
    ]);
  });

  it('opens on Oct 24 at the normal ½-hour-before-sunrise start (no special opening-day hour)', () => {
    const s = speciesStatus('pheasant', '2026-10-24', frenchCreek);
    expect(s.kind).toBe('open');
    if (s.kind !== 'open') return;
    const day = officialDay('2026-10-24', frenchCreek.lng)!;
    expect(s.start).toEqual(day.huntStart);
    expect(s.end).toEqual(day.huntEnd);
    expect(speciesStatus('pheasant', '2026-12-25', frenchCreek).kind).toBe('closed');
  });
});

describe('hours zone at French Creek', () => {
  it('uses the 75-76°W band with no minute offset', () => {
    const z = pgcHoursZone(frenchCreek.lng)!;
    expect(z).toBeTruthy();
    expect(JSON.stringify(z)).toMatch(/75/);
    const day = officialDay('2026-10-24', frenchCreek.lng)!;
    // Digest weekly table, Oct 18-24: 6:51 a.m. to 6:38 p.m. (75th meridian, +0 min).
    expect(day.huntStart.toISOString()).toBe('2026-10-24T10:51:00.000Z');
    expect(day.huntEnd.toISOString()).toBe('2026-10-24T22:38:00.000Z');
  });
});
