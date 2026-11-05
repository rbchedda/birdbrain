import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PastSeasonsCard } from '@/components/spot/PastSeasonsCard';
import { useSampleData } from '@/lib/env';
import { writeAgeGate, writeJson } from '@/lib/localStore';
import type { TermsAcceptance } from '@/data/backend';
import { TERMS_VERSION } from '@/data/terms';
import { todayET, type Ymd } from '@/lib/time';
import { colors, fonts, space } from '@/theme/tokens';

const TERMS_KEY = 'birdbrain.termsAccepted.v1';
const JOURNAL_KEY = 'birdbrain.journal.v2';

/**
 * Dev-only Expo-web screenshot harness for PastSeasonsCard.
 * Only mounts when EXPO_PUBLIC_USE_SAMPLE_DATA=1. Optional `seed` query carries
 * base64url(JSON journal array) from scripts/capture-past-seasons-web.mjs — never
 * bundled as app content. Also writes terms + age so ConsentGate lets the card through.
 */
export default function PastSeasonsShot() {
  const { placeId, reference, seed } = useLocalSearchParams<{
    placeId?: string;
    reference?: string;
    seed?: string;
  }>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const acceptance: TermsAcceptance = {
        acceptedAt: '2026-11-01T12:00:00.000Z',
        appVersion: '0.1.0',
        termsVersion: TERMS_VERSION,
      };
      await writeJson(TERMS_KEY, acceptance);
      await writeAgeGate('passed');
      if (seed && typeof seed === 'string') {
        try {
          const b64 = seed.replace(/-/g, '+').replace(/_/g, '/');
          const json = decodeURIComponent(escape(atob(b64)));
          await writeJson(JOURNAL_KEY, JSON.parse(json));
        } catch {
          // leave journal as-is
        }
      }
      if (live) setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [seed]);

  if (!useSampleData) return <Redirect href="/" />;
  const id = placeId || 'sgl-sample-1';
  const ref = (reference as Ymd) || todayET();
  if (!ready) {
    return (
      <View style={styles.root} testID="past-seasons-shot-loading">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <View style={styles.root} testID="past-seasons-shot">
      <Text style={styles.head}>Past seasons shot · {id}</Text>
      <ScrollView contentContainerStyle={styles.body}>
        <PastSeasonsCard placeId={id} reference={ref} />
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
