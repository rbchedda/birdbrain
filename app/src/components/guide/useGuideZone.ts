import { useEffect, useState } from 'react';

import { DEFAULT_AT } from '@/components/OpenToday';
import { readJson, writeJson } from '@/lib/localStore';
import { pgcHoursZone } from '@/lib/sun';

const ZONE_KEY = 'guide.zone';
const defaultZone = pgcHoursZone(DEFAULT_AT.lng)?.zone ?? 1;

/** The PGC hours zone picked on the Guide, shared by the Guide and its detail screens. */
export function useGuideZone() {
  const [zone, setZone] = useState(defaultZone);
  useEffect(() => {
    readJson<number>(ZONE_KEY, defaultZone).then(setZone);
  }, []);
  const pickZone = (z: number) => {
    setZone(z);
    writeJson(ZONE_KEY, z);
  };
  return [zone, pickZone] as const;
}
