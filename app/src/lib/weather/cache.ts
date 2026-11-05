import { readJson, writeJson } from '@/lib/localStore';

import type { Forecast } from './nws';

/** Last good 7-day forecast per spot, so it still shows with no signal. */
const key = (spotId: string) => `birdbrain.forecast.v1.${spotId}`;

export const readCachedForecast = (spotId: string) => readJson<Forecast | null>(key(spotId), null);
export const writeCachedForecast = (spotId: string, f: Forecast) => writeJson(key(spotId), f);

/** "As of Thu 3:05 PM" in the device's zone (spots are all in PA, but the phone's clock is what people read). */
export function asOfLabel(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `As of ${sameDay ? time : `${day}, ${time}`}`;
}
