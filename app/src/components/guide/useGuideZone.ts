import { useEffect, useState } from 'react';

import { DEFAULT_AT } from '@/components/OpenToday';
import { readJson, writeJson } from '@/lib/localStore';
import { pgcHoursZone } from '@/lib/sun';

const ZONE_KEY = 'guide.zone';
/** Zone of the default map point. Used only to fill the hours table until the user picks; never shown as theirs. */
export const DEFAULT_HOURS_ZONE = pgcHoursZone(DEFAULT_AT.lng)?.zone ?? 1;

/**
 * The PGC hours zone (sunrise/sunset band, not a WMU) picked on the PGC table.
 * Returns [zone, pickZone, picked]; `picked` is false until the user explicitly chooses one.
 */
export function useGuideZone() {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    readJson<number | null>(ZONE_KEY, null).then((z) => setPicked(typeof z === 'number' ? z : null));
  }, []);
  const pickZone = (z: number) => {
    setPicked(z);
    writeJson(ZONE_KEY, z);
  };
  return [picked ?? DEFAULT_HOURS_ZONE, pickZone, picked !== null] as const;
}
