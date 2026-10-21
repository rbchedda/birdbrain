import { useEffect, useMemo, useState } from 'react';

import { listDogs } from '@/data/dogs';
import { useJournal, usePlaces } from '@/data/hooks';
import { badges, dogStats, lifeList, seasonOf, seasonStats, type PlaceLookup } from '@/data/stats';
import type { Dog } from '@/data/types';
import { todayET } from '@/lib/time';

/** Everything the profile screens derive from the private hunt log. */
export function useProfileData() {
  const journal = useJournal();
  const { places } = usePlaces();
  const [roster, setRoster] = useState<Dog[]>([]);
  const reloadDogs = () => listDogs().then(setRoster);
  useEffect(() => {
    void reloadDogs();
  }, []);
  const season = seasonOf(todayET());
  const entries = journal.data ?? [];
  const lookup: PlaceLookup = useMemo(() => {
    const byId = new Map(places.map((p) => [p.id, p]));
    return (id) => (id ? byId.get(id) : undefined);
  }, [places]);
  const derived = useMemo(
    () => ({
      stats: seasonStats(entries, season, lookup),
      life: lifeList(entries, season, lookup),
      dogs: dogStats(entries, roster),
      badges: badges(entries, season, lookup),
    }),
    [entries, season, lookup, roster],
  );
  return { ...journal, entries, season, roster, reloadDogs, lookup, ...derived };
}
