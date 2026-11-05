import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { seasonDays, snapshotDay } from '@/testUtils/seasonParity';

/**
 * No-behaviour-change proof for the SEASONS registry: every season-driven output on every day of
 * 2026-27 must hash the same as the pre-registry code. Regenerate ONLY from the old code:
 *   SEASON_PARITY_WRITE=1 npx jest seasonParity
 */
const FIXTURE = path.join(__dirname, 'fixtures', 'season-2026-27-parity.json');
const SAMPLE_DAYS = ['2026-09-01', '2026-11-05', '2026-12-25', '2027-01-03', '2027-05-10', '2027-06-30'];
const hash = (v: unknown) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex');

describe('2026-27 season outputs are unchanged by the SEASONS registry', () => {
  const days = seasonDays();
  if (process.env.SEASON_PARITY_WRITE) {
    it('writes the fixture', () => {
      const hashes = Object.fromEntries(days.map((d) => [d, hash(snapshotDay(d))]));
      const samples = Object.fromEntries(SAMPLE_DAYS.map((d) => [d, snapshotDay(d)]));
      fs.writeFileSync(FIXTURE, JSON.stringify({ capturedFrom: process.env.SEASON_PARITY_WRITE, hashes, samples }, null, 1) + '\n');
    });
    return;
  }
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { hashes: Record<string, string>; samples: Record<string, unknown> };
  it('covers every day Jul 1 2026 – Jun 30 2027', () => {
    expect(Object.keys(fixture.hashes)).toEqual(days);
  });
  it.each(SAMPLE_DAYS)('full outputs on %s are identical', (d) => {
    expect(snapshotDay(d)).toEqual(fixture.samples[d]);
  });
  it('every day hashes identically', () => {
    const changed = days.filter((d) => hash(snapshotDay(d)) !== fixture.hashes[d]);
    expect(changed).toEqual([]);
  });
});
