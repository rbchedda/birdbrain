import type { Ymd } from './time';

const rad = Math.PI / 180;
const J2000 = 2451545;
const unixEpochJd = 2440587.5;

/**
 * Sunrise and sunset for a calendar date and place (sunrise equation, within a
 * minute or two at PA latitudes). Returns null for polar day/night.
 */
export function sunTimes(ymd: Ymd, lat: number, lng: number): { sunrise: Date; sunset: Date } | null {
  const [y, m, d] = ymd.split('-').map(Number);
  const jd = Date.UTC(y, m - 1, d) / 86400000 + unixEpochJd;
  const n = Math.ceil(jd - J2000 + 0.0008);
  const jStar = n - lng / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = J2000 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const decl = Math.asin(Math.sin(lambda * rad) * Math.sin(23.4397 * rad));
  const cosW =
    (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosW < -1 || cosW > 1) return null;
  const w = Math.acos(cosW) / rad / 360;
  const toDate = (j: number) => new Date((j - unixEpochJd) * 86400000);
  return { sunrise: toDate(transit - w), sunset: toDate(transit + w) };
}
