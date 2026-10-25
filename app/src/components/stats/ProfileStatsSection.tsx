import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/ui';
import { buildStats } from '@/data/statsCharts';
import { sampleEntries, sampleLookup, sampleRoster, SAMPLE_SEASON, SAMPLE_TODAY } from '@/data/statsSample';
import { seasonLabel } from '@/data/stats';
import { flags } from '@/lib/flags';
import { colors, fonts, radius, space } from '@/theme/tokens';

import { MonthBars } from './charts';
import { PrivacyPill, SampleBadge, Skeleton, TilesRow } from './parts';
import { useStatsData } from './useStats';

/**
 * Profile › Stats section: a live, private preview of this season (the same
 * numbers as the Stats page, from the same aggregation and account restore),
 * with one obvious way into the full page. No hunts this season shows a
 * clearly labelled SAMPLE preview instead. Always the current season: past
 * seasons and All time (the multiYearStats gate) live on the full page.
 */
export function ProfileStatsSection() {
  const d = useStatsData(false);
  const win = useWindowDimensions();
  const chartW = Math.min(win.width, 560) - space.lg * 2 - space.md * 2;
  const model = useMemo(() => buildStats(d.entries, d.current, d.ctx), [d.entries, d.current, d.ctx]);
  const empty = model.state === 'empty';
  const sample = useMemo(
    () =>
      empty
        ? buildStats(sampleEntries(), SAMPLE_SEASON, { lookup: sampleLookup, roster: sampleRoster, today: SAMPLE_TODAY, woodcockSeparate: flags.woodcockLog, compareLast: false })
        : null,
    [empty],
  );
  const open = () => router.push('/profile/stats');
  const m = empty && sample ? sample : model;

  return (
    <View style={s.wrap} testID="profile-stats-section">
      <View style={s.head}>
        <Text style={s.title} accessibilityRole="header">Stats</Text>
        <Text style={s.season} numberOfLines={1}>{seasonLabel(d.current)} season</Text>
        <View style={{ flex: 1 }} />
        <PrivacyPill />
      </View>

      {d.loading ? (
        <View style={{ gap: space.sm }} testID="profile-stats-loading" accessibilityLabel="Loading your stats" accessibilityLiveRegion="polite">
          <Skeleton h={80} />
          <Skeleton h={120} />
        </View>
      ) : (
        <>
          {empty && (
            <View style={s.sampleHead}>
              <SampleBadge />
              <Text style={s.cap} testID="profile-stats-empty-copy">
                No hunts logged this season yet. This is what your stats will look like.
              </Text>
            </View>
          )}
          {/* Tapping the preview also opens Stats; it stays non-accessible so each tile keeps its own label (the button below is the screen-reader path). */}
          <Pressable accessible={false} onPress={open} style={empty ? s.dim : undefined} testID={empty ? 'profile-stats-sample' : 'profile-stats-live'}>
            <View style={{ gap: space.sm }}>
              <TilesRow tiles={m.tiles} />
              {m.gates.days.ready && (
                <View style={s.chart} accessible accessibilityLabel={empty ? `Sample chart. ${m.days.a11y}` : m.days.a11y}>
                  <Text style={s.chartTitle}>Days afield by month</Text>
                  <MonthBars bars={m.days.bars} compare={false} selected={null} width={chartW} height={120} />
                </View>
              )}
            </View>
          </Pressable>
          {!empty && model.state === 'few' && <Text style={s.cap}>Charts fill in as you log more hunts.</Text>}
          {d.guest && !empty && (
            <Text style={s.cap} testID="profile-stats-guest-note">On this phone only. Sign in to save your stats to your account.</Text>
          )}
          {empty ? (
            <View style={{ gap: space.sm }}>
              <Button label="Log your first hunt" icon="add" variant="primary" onPress={() => router.push('/new/log')} />
              <SeeAll label="See all stats" onPress={open} />
            </View>
          ) : (
            <SeeAll label="See all stats" onPress={open} primary />
          )}
        </>
      )}
    </View>
  );
}

function SeeAll({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens your full stats page"
      onPress={onPress}
      style={[s.seeAll, primary && s.seeAllPrimary]}
      testID="profile-stats-see-all"
    >
      <Text style={[s.seeAllText, primary && { color: colors.onAccent }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={primary ? colors.onAccent : colors.accent} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space.sm, marginTop: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text },
  season: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, flexShrink: 1 },
  cap: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted },
  sampleHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dim: { opacity: 0.7 },
  chart: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.xs },
  chartTitle: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  seeAll: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent },
  seeAllPrimary: { backgroundColor: colors.accent },
  seeAllText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.accent },
});
