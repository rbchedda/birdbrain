import { Redirect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SpotVerdictCardView } from '@/components/spot/SpotVerdictCard';
import { samplePlaces } from '@/data/places';
import {
  computeSpotVerdict,
  toCrewSnapshot,
  verdictFromSnapshot,
  type SpotVerdict,
} from '@/data/spotVerdict';
import type { JournalEntry } from '@/data/journal';
import { emptyDiaryDetails, type DiaryDetails, type Species } from '@/data/types';
import { useSampleData } from '@/lib/env';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * Dev-only Expo-web screenshot harness for spot verdict states.
 * Sample-data only — Redirects otherwise. Never ships seed as product content.
 */

let n = 0;
function entry(
  huntedOn: string,
  placeId: string,
  d: Partial<DiaryDetails> & { flushes?: number } = {},
  species: Species = 'pheasant',
): JournalEntry {
  n++;
  const { flushes = 0, ...details } = d;
  return {
    id: `shot${n}`,
    clientId: `shot${n}`,
    author: { id: 'sample-you', username: 'you', displayName: 'You (sample)' },
    mine: true,
    kind: 'hunt',
    species,
    caption: '',
    createdAt: `${huntedOn}T18:00:00.000Z`,
    publicAfter: null,
    huntedOn,
    location: 'hidden',
    area: null,
    counts: null,
    placeCounts: [{ placeId, placeName: placeId, flushed: flushes, roosters: 0, harvested: 0 }],
    likes: 0,
    comments: 0,
    likedByMe: false,
    group: null,
    sync: { status: 'synced', version: 1, rev: 0, attempts: 0, nextAttemptAt: 0, error: null, conflict: false },
    details: {
      ...emptyDiaryDetails(),
      species: [species],
      hours: details.hours ?? 2,
      startTime: details.startTime ?? '08:00',
      flushes,
      ...details,
    },
  };
}

const place = samplePlaces.find((p) => p.id === 'sgl-sample-1')!;
const REF = '2026-11-08' as const;

function productive(): SpotVerdict {
  const entries = [
    entry('2026-10-25', place.id, { flushes: 2, hours: 1 }),
    entry('2026-11-01', place.id, { flushes: 2, hours: 1 }),
    entry('2026-11-03', place.id, { flushes: 2, hours: 1 }),
  ];
  return computeSpotVerdict({ place, entries, reference: REF, audience: 'owner' });
}

function slow(): SpotVerdict {
  const entries = [
    entry('2026-10-25', place.id, { flushes: 0, hours: 2 }),
    entry('2026-11-01', place.id, { flushes: 0, hours: 2 }),
    entry('2026-11-03', place.id, { flushes: 0, hours: 2 }),
  ];
  return computeSpotVerdict({ place, entries, reference: REF, audience: 'owner' });
}

function fresh(): SpotVerdict {
  return computeSpotVerdict({ place, entries: [], reference: REF, audience: 'owner' });
}

function closed(): SpotVerdict {
  return computeSpotVerdict({
    place,
    entries: [],
    reference: '2026-06-01',
    audience: 'owner',
    species: ['pheasant'],
  });
}

function crewFrozen(): SpotVerdict {
  const entries = [
    entry('2026-10-25', place.id, { flushes: 2, hours: 1 }),
    entry('2026-11-01', place.id, { flushes: 2, hours: 1 }),
    entry('2026-11-03', place.id, { flushes: 2, hours: 1 }),
  ];
  const planDate = '2026-11-08';
  const v = computeSpotVerdict({
    place,
    entries,
    reference: planDate,
    audience: 'crew',
    ownerDisplayName: 'Alex',
    planDate,
    now: new Date(2026, 10, 8, 16, 0, 0, 0),
  });
  return verdictFromSnapshot(toCrewSnapshot(v, planDate));
}

const MODES: Record<string, () => SpotVerdict> = {
  productive,
  slow,
  empty: fresh,
  closed,
  crew: crewFrozen,
};

export default function SpotVerdictShot() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  if (!useSampleData) return <Redirect href="/" />;
  const key = (mode && MODES[mode] ? mode : 'productive') as keyof typeof MODES;
  const verdict = MODES[key]!();
  return (
    <View style={styles.root} testID="spot-verdict-shot">
      <Text style={styles.head}>Spot verdict shot · {key}</Text>
      <ScrollView contentContainerStyle={styles.body}>
        <SpotVerdictCardView verdict={verdict} testID="spot-verdict" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingTop: space.xl },
  head: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.muted,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
});
