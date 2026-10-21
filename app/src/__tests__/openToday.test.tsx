import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { OpenToday } from '@/components/OpenToday';
import { PGC_DIGEST_URL, REGS } from '@/data/regs';
import { legalHours, speciesStatus } from '@/data/seasons';
import { etWallTime, pgcHoursZone, pgcSunTimes, sunTimes } from '@/lib/sun';
import { etParts } from '@/lib/time';

const harrisburg = { lat: 40.27, lng: -76.88 };
const middleCreek = { lat: 40.27, lng: -76.25 };
const sgl101 = { lat: 40.0, lng: -80.47 };
const hhmm = (d: Date) => {
  const p = etParts(d);
  return `${p.hour}:${String(p.minute).padStart(2, '0')}`;
};

describe('PGC hours zones', () => {
  it('maps longitude to the 7 bands', () => {
    expect(pgcHoursZone(-74.9)).toEqual({ zone: 1, minutesPlus: 0 });
    expect(pgcHoursZone(-75.5)).toEqual({ zone: 2, minutesPlus: 0 });
    expect(pgcHoursZone(middleCreek.lng)).toEqual({ zone: 3, minutesPlus: 4 });
    expect(pgcHoursZone(harrisburg.lng)).toEqual({ zone: 3, minutesPlus: 4 });
    expect(pgcHoursZone(-77.5).minutesPlus).toBe(8);
    expect(pgcHoursZone(sgl101.lng)).toEqual({ zone: 7, minutesPlus: 20 });
  });

  it('applies zone minutes to the ingested base row (PGC Oct 21 2026: 07:18 / 18:12)', () => {
    const row = { date: '2026-10-21', sunrise: '07:18', sunset: '18:12' };
    const mc = pgcSunTimes('2026-10-21', middleCreek, row)!;
    expect(mc.source).toBe('pgc');
    expect(hhmm(mc.sunrise)).toBe('7:22'); // matches USNO per the data review
    expect(hhmm(mc.sunset)).toBe('18:16');
    const west = pgcSunTimes('2026-10-21', sgl101, row)!;
    expect(hhmm(west.sunrise)).toBe('7:38');
    expect(hhmm(west.sunset)).toBe('18:32');
  });

  it('falls back to the sunrise equation without a row, or with a row for another day', () => {
    expect(pgcSunTimes('2026-10-22', middleCreek, { date: '2026-10-21', sunrise: '07:18', sunset: '18:12' })!.source).toBe('computed');
    expect(pgcSunTimes('2026-10-22', middleCreek)!.sunrise).toEqual(sunTimes('2026-10-22', middleCreek.lat, middleCreek.lng)!.sunrise);
  });

  it('handles DST in wall times', () => {
    expect(etWallTime('2026-07-01', '06:00').toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(etWallTime('2026-12-01', '06:00').toISOString()).toBe('2026-12-01T11:00:00.000Z');
  });
});

describe('legal hours by species rule', () => {
  const row = { date: '2026-11-07', sunrise: '06:39', sunset: '16:58' };
  it('small game: ½ hour before sunrise to ½ hour after sunset', () => {
    const h = legalHours('smallGame', '2026-11-07', middleCreek, row)!;
    expect([hhmm(h.start), hhmm(h.end)]).toEqual(['6:13', '17:32']);
  });
  it('migratory: ends at sunset', () => {
    const h = legalHours('migratory', '2026-11-07', middleCreek, row)!;
    expect(hhmm(h.end)).toBe('17:02');
  });
  it('spring gobbler: noon through May 15, then ½ hour after sunset', () => {
    expect(hhmm(legalHours('springTurkey', '2027-05-15', harrisburg)!.end)).toBe('12:00');
    const late = legalHours('springTurkey', '2027-05-16', harrisburg)!;
    expect(etParts(late.end).hour).toBeGreaterThanOrEqual(20);
  });
});

describe('season status on fixed dates', () => {
  it('opens pheasant on the general opener (Sat Oct 24 2026)', () => {
    expect(speciesStatus('pheasant', '2026-10-23', harrisburg).kind).toBe('closed');
    const s = speciesStatus('pheasant', '2026-10-24', harrisburg);
    expect(s.kind === 'open' && !s.season.youth).toBe(true);
  });
  it('closes pheasant and grouse on Christmas', () => {
    expect(speciesStatus('pheasant', '2026-12-25', harrisburg).kind).toBe('closed');
    expect(speciesStatus('grouse', '2026-12-25', harrisburg).kind).toBe('closed');
  });
  it('keeps pheasant open on Sundays but closes doves (Sun Nov 1 2026)', () => {
    expect(speciesStatus('pheasant', '2026-11-01', harrisburg).kind).toBe('open');
    expect(speciesStatus('dove', '2026-11-01', harrisburg).kind).toBe('sunday');
  });
  it('closes doves between segments', () => {
    expect(speciesStatus('dove', '2026-12-01', harrisburg)).toMatchObject({ kind: 'closed', nextOpen: { date: '2026-12-18' } });
  });
});

describe('OpenToday card', () => {
  const now = new Date('2026-11-01T15:00:00Z'); // Sunday 10 AM ET

  it('shows every species with status, limits and Sunday rule', async () => {
    await render(<OpenToday now={now} at={middleCreek} />);
    expect(screen.getByText('Open today?')).toBeTruthy();
    expect(screen.getByText(/Sun, Nov 1 \(Sunday\) · Hours for PGC zone 3 \(\+4 min\)/)).toBeTruthy();
    expect(screen.getByText('All 21 Sundays in the pheasant season are open.')).toBeTruthy();
    expect(screen.getByText('Daily 2 (either sex) · Possession 6')).toBeTruthy();
    expect(screen.getAllByText('Closed Sundays (migratory birds)').length).toBeGreaterThan(0);
    expect(screen.getByText('Daily 15 · Possession 45')).toBeTruthy();
  });

  it('shows the as-of date and links to the PGC digest', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<OpenToday now={now} />);
    expect(screen.getByText(/Regulations as of Wed, Oct 21, 2026/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open the PGC Hunting & Trapping Digest'));
    expect(open).toHaveBeenCalledWith(PGC_DIGEST_URL);
  });
});
