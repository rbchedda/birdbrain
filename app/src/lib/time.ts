/**
 * Dates in BirdBrain follow Pennsylvania: seasons, legal hours and the post
 * delay are all in America/New_York regardless of the device's time zone.
 */
export const TZ = 'America/New_York';

/** Calendar date as 'YYYY-MM-DD'. */
export type Ymd = string;

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function etParts(d: Date) {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(d)) p[type] = value;
  return {
    ymd: `${p.year}-${p.month}-${p.day}` as Ymd,
    weekday: p.weekday,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
  };
}

export const todayET = (now = new Date()) => etParts(now).ymd;

export function addDays(ymd: Ymd, n: number): Ymd {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekdayOf(ymd: Ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

/** Midnight Eastern starting the given date, as an instant. Mirrors public.next_day_et. */
export function midnightET(ymd: Ymd): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  // Midnight ET is 04:00Z under EDT and 05:00Z under EST.
  const edt = new Date(Date.UTC(y, m - 1, d, 4));
  return etParts(edt).hour === 0 ? edt : new Date(Date.UTC(y, m - 1, d, 5));
}

export const nextMidnightET = (from: Date) => midnightET(addDays(etParts(from).ymd, 1));

/** When a shared post goes public: the later of next-day midnight ET or 12 hours on. Mirrors public.min_public_delay(). */
export const publicAfterET = (from: Date) =>
  new Date(Math.max(nextMidnightET(from).getTime(), from.getTime() + 12 * 3600_000));

const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
export const formatTime = (d: Date) => timeFmt.format(d);

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
export function formatDay(ymd: Ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return dayFmt.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Compact relative age for feed timestamps: 5m, 3h, 2d, then a date. */
export function ago(iso: string, now = new Date()) {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  return formatDay(etParts(new Date(iso)).ymd);
}
