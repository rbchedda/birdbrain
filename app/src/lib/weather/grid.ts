/** Viewport sampling, throttling and a concurrency cap for the wind layer. */

export type Bounds = [[number, number], [number, number]]; // [[west, south], [east, north]]

/**
 * n x n sample points over the viewport, inset half a cell so arrows sit
 * inside the screen. Points are snapped to 0.01° so panning a little reuses
 * cached /points lookups.
 */
export function sampleGrid(bounds: Bounds, n = 3): { lng: number; lat: number }[] {
  const [[w, s], [e, nn]] = bounds;
  if (![w, s, e, nn].every(Number.isFinite) || e <= w || nn <= s || n < 1) return [];
  const out: { lng: number; lat: number }[] = [];
  const snap = (v: number) => Math.round(v * 100) / 100;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out.push({ lng: snap(w + ((c + 0.5) / n) * (e - w)), lat: snap(s + ((r + 0.5) / n) * (nn - s)) });
    }
  }
  // Dedup (very small viewports snap to the same point).
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = `${p.lng},${p.lat}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Grid size for a zoom: wide views get 3x3, closer views 4x4. */
export const gridSizeFor = (zoom: number | undefined) => (zoom !== undefined && zoom >= 9 ? 4 : 3);

/** Trailing debounce. `cancel` drops a pending call. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn(...a);
    }, ms);
  };
  d.cancel = () => {
    if (t) clearTimeout(t);
    t = undefined;
  };
  return d;
}

/** Run tasks with at most `limit` in flight; results keep input order (settled, never rejects). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
