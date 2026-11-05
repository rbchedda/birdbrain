import { useEffect, useMemo, useRef, useState } from 'react';

import { asOfLabel, readCachedForecast, writeCachedForecast } from './cache';
import { type Bounds, debounce, gridSizeFor, mapLimit, sampleGrid } from './grid';
import { type Forecast, getForecast, getHourly, NwsError, nwsErrorText } from './nws';

export type SpotForecastState = {
  forecast: Forecast | null;
  /** True while the shown forecast came from the device cache (no fresh fetch yet, or it failed). */
  cached: boolean;
  loading: boolean;
  error: string | null;
  asOf: string | null;
  retry: () => void;
};

/**
 * 7-day forecast for a spot. Shows the cached copy immediately, then fetches
 * when `active`. A failed fetch keeps the cached copy with its as-of label.
 */
export function useSpotForecast(spotId: string, center: { lat: number; lng: number }, active = true): SpotForecastState {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fresh = useRef(false);
  const { lat, lng } = center;

  useEffect(() => {
    let live = true;
    fresh.current = false;
    setForecast(null);
    setCached(false);
    setError(null);
    readCachedForecast(spotId).then((c) => {
      // A live fetch that already landed wins over the cached copy.
      if (!live || !c || fresh.current) return;
      setForecast(c);
      setCached(true);
    });
    return () => {
      live = false;
    };
  }, [spotId]);

  useEffect(() => {
    if (!active) return;
    let live = true;
    const ctrl = new AbortController();
    setLoading(true);
    getForecast(lat, lng, ctrl.signal).then(
      (f) => {
        if (!live) return;
        fresh.current = true;
        setForecast(f);
        setCached(false);
        setError(null);
        setLoading(false);
        writeCachedForecast(spotId, f);
      },
      (e) => {
        if (!live) return;
        setError(nwsErrorText(e));
        setLoading(false);
      },
    );
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [spotId, lat, lng, active, attempt]);

  return {
    forecast,
    cached: !!forecast && cached,
    loading,
    error,
    asOf: asOfLabel(forecast?.fetchedAt),
    retry: () => setAttempt((a) => a + 1),
  };
}

export type WindSample = { lng: number; lat: number; fromDeg: number | null; mph: number | null; speed: string };
export type Viewport = { bounds: Bounds; zoom?: number; center: { lng: number; lat: number } };
export type WindNow = { temperature: number | null; unit: string; precip: number | null; wind: string; place: string | null; asOf: string | null };

export const WIND_DEBOUNCE_MS = 800;
export const WIND_CONCURRENCY = 3;

/**
 * Wind layer: after the map settles (debounced), samples a 3x3 or 4x4 grid,
 * fetches the current hour at each point (max 3 requests in flight) and the
 * viewport center's temperature and precip chance. Newer viewports cancel
 * older runs. Never throws; failures become `error` and keep the last arrows.
 */
export function useWindOverlay(enabled: boolean, viewport: Viewport | null) {
  const [samples, setSamples] = useState<WindSample[] | null>(null);
  const [now, setNow] = useState<WindNow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef<AbortController | null>(null);

  const load = useMemo(
    () =>
      debounce((vp: Viewport) => {
        run.current?.abort();
        const ctrl = new AbortController();
        run.current = ctrl;
        setLoading(true);
        const pts = sampleGrid(vp.bounds, gridSizeFor(vp.zoom));
        const grid = mapLimit(pts, WIND_CONCURRENCY, async (p) => {
          const h = await getHourly(p.lat, p.lng, ctrl.signal);
          const cur = h.periods[0];
          if (!cur) throw new NwsError('bad-data', 'empty hourly');
          return { lng: p.lng, lat: p.lat, fromDeg: cur.windFromDeg, mph: cur.windMph, speed: cur.windSpeed } as WindSample;
        });
        const center = getHourly(vp.center.lat, vp.center.lng, ctrl.signal).then((h) => {
          const cur = h.periods[0];
          if (!cur) throw new NwsError('bad-data', 'empty hourly');
          return {
            temperature: cur.temperature,
            unit: cur.temperatureUnit,
            precip: cur.precip,
            wind: cur.windSpeed ? `${cur.windDirection} ${cur.windSpeed}`.trim() : '',
            place: h.place,
            asOf: asOfLabel(h.fetchedAt),
          } as WindNow;
        });
        Promise.all([grid, center.then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e }))]).then(([g, c]) => {
          if (ctrl.signal.aborted) return;
          const ok = g.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
          const firstErr = g.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
          if (ok.length) setSamples(ok);
          if (c.ok) setNow(c.v);
          setError(!ok.length && !c.ok ? nwsErrorText(c.e ?? firstErr?.reason) : null);
          setLoading(false);
        });
      }, WIND_DEBOUNCE_MS),
    [],
  );

  const key = viewport ? viewport.bounds.flat().map((n) => n.toFixed(3)).join(',') : '';
  useEffect(() => {
    if (!enabled || !viewport) {
      load.cancel();
      run.current?.abort();
      setLoading(false);
      return;
    }
    load(viewport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, load]);

  useEffect(
    () => () => {
      load.cancel();
      run.current?.abort();
    },
    [load],
  );

  return { samples: enabled ? samples : null, now: enabled ? now : null, loading: enabled && loading, error: enabled ? error : null };
}
