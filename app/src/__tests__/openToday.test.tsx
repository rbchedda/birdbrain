import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { OpenToday } from '@/components/OpenToday';
import huntingHours from '@/data/huntingHours.json';
import { PGC_DIGEST_URL, REGS, regsFor, sundayAllowed } from '@/data/regs';
import { describeStatus, legalHours, placeToday, speciesStatus } from '@/data/seasons';
import { etWallTime, officialDay, officialHours, pgcHoursZone, type HoursTable } from '@/lib/sun';
import { etParts } from '@/lib/time';

const harrisburg = { lat: 40.27, lng: -76.88 };
const pittsburgh = { lat: 40.44, lng: -79.996 };
const erie = { lat: 42.13, lng: -80.085 };
const hhmm = (d: Date | null) => {
  if (!d) return null;
  const p = etParts(d);
  const h = p.hour % 12 || 12;
  return `${h}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'AM' : 'PM'}`;
};

describe('bundled PGC hunting-hours table', () => {
  it('covers 2025-01-01..2035-12-31 with source and fetch date recorded', () => {
    expect(huntingHours.count).toBe(4017);
    expect(huntingHours.first).toBe('2025-01-01');
    expect(huntingHours.last).toBe('2035-12-31');
    expect(huntingHours.source).toMatch(/PGC_Hunting_Hours\/FeatureServer\/400$/);
    expect(new Date(huntingHours.fetchedAt).getTime()).toBeGreaterThan(0);
    expect(huntingHours.zones.map((z) => z.minutesPlus)).toEqual([0, 0, 4, 8, 12, 16, 20]);
  });

  it('maps longitude to the official zones', () => {
    expect(pgcHoursZone(harrisburg.lng)).toMatchObject({ zone: 3, minutesPlus: 4 });
    expect(pgcHoursZone(pittsburgh.lng)).toMatchObject({ zone: 6, minutesPlus: 16 });
    expect(pgcHoursZone(erie.lng)).toMatchObject({ zone: 7, minutesPlus: 20 });
    expect(pgcHoursZone(-82)).toBeNull();
  });

  it('handles DST in wall times', () => {
    expect(etWallTime('2026-07-01', '06:00').toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(etWallTime('2026-12-01', '06:00').toISOString()).toBe('2026-12-01T11:00:00.000Z');
  });
});

describe('official rows', () => {
  it('Erie, May 10 2027: 5:41 AM to 8:54 PM', () => {
    const d = officialDay('2027-05-10', erie.lng)!;
    expect([hhmm(d.huntStart), hhmm(d.huntEnd)]).toEqual(['5:41 AM', '8:54 PM']);
  });
  it('Harrisburg, Oct 21 2026: ends 6:46 PM', () => {
    expect(hhmm(officialDay('2026-10-21', harrisburg.lng)!.huntEnd)).toBe('6:46 PM');
    const s = speciesStatus('grouse', '2026-10-21', harrisburg);
    expect(s.kind === 'open' && hhmm(s.end)).toBe('6:46 PM');
  });
  it('Pittsburgh, Oct 21 2026: ends 6:58 PM', () => {
    expect(hhmm(officialDay('2026-10-21', pittsburgh.lng)!.huntEnd)).toBe('6:58 PM');
  });
});

describe('legal hours by species rule', () => {
  it('migratory birds end at sunset', () => {
    const d = officialDay('2026-11-07', harrisburg.lng)!;
    expect(legalHours('migratory', '2026-11-07', harrisburg.lng)).toEqual({ start: d.huntStart, end: d.sunset });
  });
  it('spring gobbler: noon through May 15, then the table hunt end', () => {
    expect(hhmm(legalHours('springTurkey', '2027-05-10', erie.lng)!.end)).toBe('12:00 PM');
    expect(legalHours('springTurkey', '2027-05-16', erie.lng)!.end).toEqual(officialDay('2027-05-16', erie.lng)!.huntEnd);
  });
});

describe('missing date or zone: check the digest, never a computed time', () => {
  const gap: HoursTable = { ...officialHours, rows: { ...officialHours.rows } };
  delete gap.rows['2026-11-03'];

  it('returns no hours and says check the digest for a missing date', () => {
    expect(officialDay('2026-11-03', harrisburg.lng, gap)).toBeNull();
    const s = speciesStatus('pheasant', '2026-11-03', harrisburg, gap);
    expect(s).toMatchObject({ kind: 'open', start: null, end: null });
    expect(describeStatus(s)).toBe('Open today · hours: check the PGC digest');
  });

  it('does the same outside the table range and outside the zones', () => {
    expect(officialDay('2036-01-02', harrisburg.lng)).toBeNull();
    expect(describeStatus(speciesStatus('pheasant', '2026-11-03', { lat: 40, lng: -82 }))).toBe('Open today · hours: check the PGC digest');
  });
});

describe('season and Sunday rules on fixed dates', () => {
  it('opens pheasant on the general opener (Sat Oct 24 2026)', () => {
    expect(speciesStatus('pheasant', '2026-10-23', harrisburg).kind).toBe('closed');
    const s = speciesStatus('pheasant', '2026-10-24', harrisburg);
    expect(s.kind === 'open' && !s.season.youth).toBe(true);
  });
  it('closes pheasant and grouse on Christmas', () => {
    expect(speciesStatus('pheasant', '2026-12-25', harrisburg).kind).toBe('closed');
    expect(speciesStatus('grouse', '2026-12-25', harrisburg).kind).toBe('closed');
  });
  it('keeps pheasant open on Sundays, fall turkey defers to the WMU (dates vary), closes doves (Sun Nov 1 2026)', () => {
    expect(speciesStatus('pheasant', '2026-11-01', harrisburg).kind).toBe('open');
    expect(speciesStatus('turkey', '2026-11-01', harrisburg).kind).toBe('check');
    expect(speciesStatus('dove', '2026-11-01', harrisburg).kind).toBe('sunday');
  });
  it('turkey Sundays are open, except SE state parks/preserves outside Nov 15, 22, 29', () => {
    expect(regsFor('turkey').sunday).toBe('open');
    expect(sundayAllowed('turkey', '2026-11-08')).toBe(true);
    expect(sundayAllowed('turkey', '2026-11-08', { county: 'Chester', stateParkOrPreserve: true })).toBe(false);
    expect(sundayAllowed('turkey', '2026-11-15', { county: 'Chester', stateParkOrPreserve: true })).toBe(true);
    expect(sundayAllowed('turkey', '2026-11-08', { county: 'Dauphin', stateParkOrPreserve: true })).toBe(true);
    expect(sundayAllowed('dove', '2026-11-15')).toBe(false);
  });
  it('turkey limits are 1 per season, with no fall season in 5C/5D', () => {
    expect(regsFor('turkey').daily).toMatch(/Fall 1 per season \(no fall season in WMUs 5C and 5D\); spring 1 bearded bird per season/);
    expect(regsFor('turkey').daily).not.toMatch(/second tag/);
  });
  it('pheasant: 19 statewide Sundays plus 2 junior', () => {
    expect(regsFor('pheasant').sundayNote).toBe('Sundays open: 19 statewide Sundays plus 2 in the junior season.');
  });
  it('waterfowl possession says see digest', () => {
    expect(regsFor('waterfowl').possession).toBe('See digest (federal exceptions)');
  });
  it('map place status uses the same official hours as the card', () => {
    const place = { id: 'x', name: 'Field', type: 'stocking' as const, county: 'Dauphin', species: ['pheasant' as const, 'dove' as const], center: harrisburg, acres: null, access: 'state_game_land' as const };
    const today = placeToday(place, new Date('2026-11-03T16:00:00Z'));
    const day = officialDay('2026-11-03', harrisburg.lng)!;
    expect(today.statuses[0].status).toMatchObject({ kind: 'open', start: day.huntStart, end: day.huntEnd });
    expect(today.statuses[1].status).toMatchObject({ kind: 'open', start: day.huntStart, end: day.sunset });
  });
  it('closes doves between segments', () => {
    expect(speciesStatus('dove', '2026-12-01', harrisburg)).toMatchObject({ kind: 'closed', nextOpen: { date: '2026-12-18' } });
  });
});

describe('OpenToday card', () => {
  const now = new Date('2026-11-01T15:00:00Z'); // Sunday 10 AM ET

  it('puts the disclaimer and digest link at the top, then status, limits and Sunday rules', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<OpenToday now={now} at={harrisburg} />);
    const card = screen.getByTestId('open-today');
    const first = card.props.children[0];
    expect(first.props.testID).toBe('open-today-disclaimer');
    expect(screen.getByTestId('open-today-disclaimer')).toHaveTextContent(
      'Unofficial summary, always verify with the PGC Hunting & Trapping Digest',
    );
    expect(card.props.children[1].props.accessibilityLabel).toBe('Open the PGC Hunting & Trapping Digest');
    await fireEvent.press(screen.getByRole('link', { name: 'Open the PGC Hunting & Trapping Digest' }));
    expect(open).toHaveBeenCalledWith(PGC_DIGEST_URL);

    expect(screen.getByText(/Sun, Nov 1 \(Sunday\) · Hours for PGC zone 3 \(\+4 min\)/)).toBeTruthy();
    expect(screen.getByText('Sundays open: 19 statewide Sundays plus 2 in the junior season.')).toBeTruthy();
    expect(screen.getByText('Sundays open, spring and fall.')).toBeTruthy();
    expect(screen.getByText(/Sunday exception: State parks and preserves in Bucks, Chester, Delaware, Montgomery and Philadelphia/)).toBeTruthy();
    expect(screen.getAllByText('Closed Sundays (migratory birds)').length).toBeGreaterThan(0);
    expect(screen.getByText('Daily 15 · Possession 45')).toBeTruthy();
  });

  it('shows the regulations version and as-of date', async () => {
    await render(<OpenToday now={now} />);
    expect(screen.getByTestId('open-today-asof')).toHaveTextContent(
      new RegExp(`^Regulations v${REGS.version.replace('.', '\\.')}, as of Wed, Oct 21, 2026\\. Hours from the official PGC table \\(pgc-hours@2026-07-09\\)\\.$`),
    );
    expect(REGS.version).toBe('2026-27.3');
  });
});
