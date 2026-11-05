import { useEffect, useMemo, useRef, useState } from 'react';

import { getSignal, onSignal } from '@/lib/connectivity';
import { readJson, writeJson } from '@/lib/localStore';

import { asOfLabel, readCachedForecast, writeCachedForecast } from './cache';
import { WIND_MAX_HOURS } from './config';
import { forecastAge } from './days';
import { type Bounds, debounce, sampleGrid } from './grid';
import { type Forecast, getForecast, getHourly, NwsError, type NwsErrorKind, nwsErrorText } from './nws';

export type SpotForecastState = {
  forecast: Forecast | null;
  /** True while the shown forecast came from the device cache (no fresh fetch yet, or it failed). */
  cached: boolean;
  loading: boolean;
  error: string | null;
  /** 'network'/'timeout' = no signal; others = NWS trouble. */
  errorKind: NwsErrorKind | null;
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
  const [errorKind, setErrorKind] = useState<NwsErrorKind | null>(null);
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
        setErrorKind(null);
        setLoading(false);
        writeCachedForecast(spotId, f);
      },
      (e) => {
        if (!live) return;
        setError(nwsErrorText(e));
        setErrorKind(e instanceof NwsError ? e.kind : 'network');
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
    errorKind,
    asOf: asOfLabel(forecast?.fetchedAt),
    retry: () => setAttempt((a) => a + 1),
  };
}

export type WindSample = { lng: number; lat: number; fromDeg: number | null; mph: number | null };
export type Viewport = { bounds: Bounds; zoom?: number; center: { lng: number; lat: number } };
/** One hour of the stepper: "SW 9 mph · gusts 16 · 7 AM". */
export type WindHour = { time: string; direction: string; fromDeg: number | null; mph: number | null; gust: number | null };

export const WIND_DEBOUNCE_MS = 800;
/** Arrows across the view; all from the center cell's forecast (one request per grid cell). */
export const WIND_GRID = 5;
const LAST_KEY = 'birdbrain.wind.last.v1';

/** Hours from the current hour through +48 h. */
export function windHours(f: Forecast | null, now = Date.now()): WindHour[] {
  if (!f) return [];
  return f.periods
    .filter((p) => Date.parse(p.startTime) > now - 3600_000)
    .slice(0, WIND_MAX_HOURS + 1)
    .map((p) => ({ time: p.startTime, direction: p.windDirection, fromDeg: p.windFromDeg, mph: p.windMph, gust: p.windGustMph }));
}

/**
 * Wind layer (spec wind-forecast 01/02/04). After the map settles (debounced),
 * fetches NWS hourly for the map center's grid cell and draws the chosen hour
 * as a grid of arrows. No signal: the last saved hourly forecast is used
 * (arrows at 50%); over 24 h old it's dropped and the switch needs signal.
 * Never throws; failures become `error`.
 */
export function useWindOverlay(enabled: boolean, viewport: Viewport | null) {
  const [hourly, setHourly] = useState<Forecast | null>(null);
  const [saved, setSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<Forecast | null>(null);
  const [hour, setHourState] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(getSignal().online);
  const run = useRef<AbortController | null>(null);

  useEffect(() => onSignal(() => setOnline(getSignal().online)), []);
  useEffect(() => {
    readJson<Forecast | null>(LAST_KEY, null).then((f) => f && setLastSaved(f), () => {});
  }, []);

  const load = useMemo(
    () =>
      debounce((vp: Viewport) => {
        run.current?.abort();
        const ctrl = new AbortController();
        run.current = ctrl;
        setLoading(true);
        getHourly(vp.center.lat, vp.center.lng, ctrl.signal).then(
          (h) => {
            if (ctrl.signal.aborted) return;
            setHourly(h);
            setSaved(false);
            setError(null);
            setLoading(false);
            setLastSaved(h);
            void writeJson(LAST_KEY, h);
          },
          async (e) => {
            if (ctrl.signal.aborted) return;
            const last = await readJson<Forecast | null>(LAST_KEY, null).catch(() => null);
            if (ctrl.signal.aborted) return;
            if (last && forecastAge(last.fetchedAt) !== 'expired') {
              setHourly(last);
              setSaved(true);
            }
            setError(nwsErrorText(e));
            setLoading(false);
          },
        );
      }, WIND_DEBOUNCE_MS),
    [],
  );

  const key = viewport ? `${viewport.center.lng.toFixed(2)},${viewport.center.lat.toFixed(2)}` : '';
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

  const hours = useMemo(() => windHours(hourly), [hourly]);
  const idx = Math.min(hour, Math.max(0, hours.length - 1));
  const cur = hours[idx] ?? null;
  const pts = viewport ? sampleGrid(viewport.bounds, WIND_GRID) : [];
  const samples: WindSample[] | null =
    enabled && cur ? pts.map((p) => ({ lng: p.lng, lat: p.lat, fromDeg: cur.fromDeg, mph: cur.mph })) : null;
  // Spec 04: offline with nothing saved in the last 24 h -> switch disabled "Needs signal".
  const needsSignal = !online && (!lastSaved || forecastAge(lastSaved.fetchedAt) === 'expired');

  return {
    samples,
    opacity: saved ? 0.5 : 0.85,
    hour: enabled ? cur : null,
    hourIndex: idx,
    hourCount: hours.length,
    setHour: (i: number) => setHourState(Math.max(0, Math.min(i, Math.max(0, hours.length - 1)))),
    updated: hourly ? (hourly.updated ?? hourly.fetchedAt) : null,
    saved: enabled && saved,
    savedAt: hourly?.fetchedAt ?? null,
    lastSavedAt: lastSaved?.fetchedAt ?? null,
    needsSignal,
    loading: enabled && loading,
    error: enabled ? error : null,
  };
}
