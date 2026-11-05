import { asOfLabel, readCachedForecast, writeCachedForecast } from '@/lib/weather/cache';
import { debounce, gridSizeFor, mapLimit, sampleGrid } from '@/lib/weather/grid';
import type { Forecast } from '@/lib/weather/nws';

describe('sampleGrid', () => {
  it('samples an inset n x n grid snapped to 0.01°', () => {
    const pts = sampleGrid([[-76, 40], [-75, 41]], 3);
    expect(pts).toHaveLength(9);
    expect(pts[0]).toEqual({ lng: -75.83, lat: 40.17 });
    expect(pts[8]).toEqual({ lng: -75.17, lat: 40.83 });
    pts.forEach((p) => {
      expect(p.lng).toBeGreaterThan(-76);
      expect(p.lng).toBeLessThan(-75);
    });
  });
  it('dedups tiny viewports and rejects bad bounds', () => {
    expect(sampleGrid([[-75.001, 40.001], [-75.0, 40.002]], 4)).toHaveLength(1);
    expect(sampleGrid([[-75, 40], [-76, 41]], 3)).toEqual([]);
    expect(sampleGrid([[NaN, 40], [-75, 41]], 3)).toEqual([]);
  });
  it('uses 3x3 wide and 4x4 close', () => {
    expect(gridSizeFor(7)).toBe(3);
    expect(gridSizeFor(undefined)).toBe(3);
    expect(gridSizeFor(11)).toBe(4);
  });
});

describe('debounce', () => {
  it('fires once with the last args after the quiet period, and cancels', () => {
    jest.useFakeTimers();
    const fn = jest.fn();
    const d = debounce(fn, 800);
    d(1);
    jest.advanceTimersByTime(500);
    d(2);
    jest.advanceTimersByTime(799);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
    d(3);
    d.cancel();
    jest.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('mapLimit', () => {
  it('caps in-flight work and keeps order, settling failures', async () => {
    let inFlight = 0;
    let peak = 0;
    const res = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (n === 4) throw new Error('boom');
      return n * 2;
    });
    expect(peak).toBe(3);
    expect(res.map((r) => (r.status === 'fulfilled' ? r.value : 'x'))).toEqual([2, 4, 6, 'x', 10, 12, 14]);
  });
});

describe('forecast cache', () => {
  it('round-trips per spot', async () => {
    const f: Forecast = { periods: [], updated: null, fetchedAt: '2026-11-05T20:05:00.000Z', place: null };
    await writeCachedForecast('a', f);
    expect(await readCachedForecast('a')).toEqual(f);
    expect(await readCachedForecast('b')).toBeNull();
  });
  it('labels the as-of time', () => {
    const now = new Date('2026-11-05T20:30:00');
    expect(asOfLabel('2026-11-05T20:05:00', now)).toMatch(/^As of \d{1,2}:05 PM$/);
    expect(asOfLabel('2026-11-03T08:00:00', now)).toMatch(/^As of Tue, Nov 3, 8:00 AM$/);
    expect(asOfLabel(null)).toBeNull();
    expect(asOfLabel('garbage')).toBeNull();
  });
});
