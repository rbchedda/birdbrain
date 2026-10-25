import { useLocalSearchParams } from 'expo-router';
import { Share, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';

import { ScreenHeader } from '@/components/Screen';
import { Button, Notice } from '@/components/ui';
import { PrivacyPill, SampleBadge } from '@/components/stats/parts';
import { ShareCardView, shareText } from '@/components/stats/ShareCardView';
import { useStatsData } from '@/components/stats/useStats';
import { buildShareCard } from '@/data/statsCharts';
import { SAMPLE_NOW } from '@/data/statsSample';
import { flags } from '@/lib/flags';
import { colors, fonts, space } from '@/theme/tokens';

/** Season share card. Behind `statsShare` (off) until a lawyer has checked what a card may say. */
export default function StatsShare() {
  const { sample: sampleParam } = useLocalSearchParams<{ sample?: string }>();
  const sample = sampleParam === '1';
  const d = useStatsData(sample);
  const on = flags.statsShare;
  const card = useMemo(() => (on ? buildShareCard(d.entries, d.scope, d.ctx, sample ? SAMPLE_NOW : new Date()) : null), [on, d.entries, d.scope, d.ctx, sample]);
  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile/stats" title="Share card" subtitle="Totals only" />
      <ScrollView contentContainerStyle={styles.body} testID="stats-share-screen">
        {!on || !card ? (
          <Notice>Sharing your season is not available yet. Your stats stay private to you.</Notice>
        ) : (
          <>
            {sample && <SampleBadge />}
            <View style={{ flexDirection: 'row' }}><PrivacyPill /></View>
            <ShareCardView card={card} />
            <Text style={styles.cap}>The card stops at the last full day, and waits out the same delay as a shared post, so it never shows where you are today.{card.heldBack ? ` ${card.heldBack} recent ${card.heldBack === 1 ? 'hunt is' : 'hunts are'} left out for now.` : ''}</Text>
            <Text style={styles.cap}>Never on a card: place names, dates, start times, bird totals, shots, dog names, coordinates, weather.</Text>
            <Button label="Share card" icon="share-outline" variant="primary" onPress={() => void Share.share({ message: shareText(card) })} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  cap: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted },
});
