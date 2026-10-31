import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/ui';
import { buildStats } from '@/data/statsCharts';
import { colors, fieldTarget, fonts, radius, space } from '@/theme/tokens';

import { MonthBars } from './charts';
import { PrivacyPill, Skeleton, TilesRow } from './parts';
import { useStatsData } from './useStats';

export type ProfileStats = ReturnType<typeof useProfileStats>;

/** This season's stats for Profile root (same aggregation + account restore as the Stats page). */
export function useProfileStats() {
  const d = useStatsData(false);
  const model = useMemo(() => buildStats(d.entries, d.current, d.ctx), [d.entries, d.current, d.ctx]);
  return { d, model, empty: !d.loading && model.state === 'empty' };
}

/**
 * Zero hunts this season (review beta-4.4 T1, stats spec §6): ONE card, no numbers,
 * no zero tiles and no sample data. "YOUR SEASON STARTS HERE" + one 56pt primary button.
 */
export function SeasonStartsCard() {
  return (
    <View style={s.starts} testID="profile-season-starts">
      <View style={s.startsIcon}>
        <Ionicons name="bar-chart" size={32} color={colors.dove} />
      </View>
      <Text style={s.startsTitle} accessibilityRole="header">Your season starts here</Text>
      <Text style={s.startsBody}>Log a hunt and BirdBrain builds your days afield, season calendar and flush rates. Only you can see them.</Text>
      <Button label="Log your first hunt" variant="primary" onPress={() => router.push('/new/log')} style={s.bigBtn} testID="profile-log-first" />
    </View>
  );
}

/**
 * Profile › "THIS SEASON": a live, private preview of this season with one
 * obvious way into the full page. Rendered only when there is at least one
 * hunt this season (the empty case is SeasonStartsCard). Always the current
 * season: past seasons and All time (multiYearStats) live on the Stats page.
 */
export function ProfileStatsSection({ stats }: { stats: ProfileStats }) {
  const { d, model, empty } = stats;
  const win = useWindowDimensions();
  const chartW = Math.min(win.width, 560) - space.lg * 2 - space.md * 2;
  if (empty) return null;
  const open = () => router.push('/profile/stats');

  return (
    <View style={s.wrap} testID="profile-stats-section">
      <View style={s.head}>
        <Text style={s.title} accessibilityRole="header">This season</Text>
        <PrivacyPill label="Only you can see these stats" />
      </View>

      {d.loading ? (
        <View style={{ gap: space.sm }} testID="profile-stats-loading" accessibilityLabel="Loading your stats" accessibilityLiveRegion="polite">
          <Skeleton h={76} />
          <Skeleton h={120} />
        </View>
      ) : (
        <>
          {/* Tapping the preview also opens Stats; it stays non-accessible so each tile keeps its own label (the row below is the screen-reader path). */}
          <Pressable accessible={false} onPress={open} testID="profile-stats-live">
            <View style={{ gap: space.sm }}>
              <TilesRow tiles={model.tiles} />
              {model.gates.days.ready && (
                <View style={s.chart} accessible accessibilityLabel={model.days.a11y}>
                  <Text style={s.chartTitle}>Days afield by month</Text>
                  <MonthBars bars={model.days.bars} compare={false} selected={null} width={chartW} height={120} />
                </View>
              )}
            </View>
          </Pressable>
          {model.state === 'few' && <Text style={s.cap}>Charts fill in as you log more hunts.</Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all stats"
            accessibilityHint="Opens your full stats page"
            onPress={open}
            hitSlop={{ left: 16, right: 16 }}
            style={({ pressed }) => [s.seeAll, pressed && { opacity: 0.7 }]}
            testID="profile-stats-see-all"
          >
            <Text style={s.seeAllText}>See all stats</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.accent} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space.sm },
  // "THIS SEASON": Barlow Condensed 22/700, uppercase, 24pt above and 8pt below (review tweak 10).
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: 0 },
  title: { fontFamily: fonts.heading, fontSize: 22, textTransform: 'uppercase', color: colors.text },
  cap: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted },
  chart: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.xs },
  chartTitle: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  seeAll: { minHeight: fieldTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  seeAllText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.accent },
  starts: { alignItems: 'center', gap: space.md, padding: space.xl, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  startsIcon: { width: 72, height: 72, borderRadius: 16, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
  startsTitle: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.text, textAlign: 'center' },
  startsBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.subtle, textAlign: 'center' },
  bigBtn: { alignSelf: 'stretch', minHeight: fieldTarget },
});
