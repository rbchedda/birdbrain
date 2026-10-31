import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { Button, Notice } from '@/components/ui';
import { CalendarHeat, DogBars, FlushDots, FlushLegend, HBars, HeatLegend, MonthBars, Swatch, placeItems, speciesItems } from '@/components/stats';
import { ChartCard, LockedCard, PrivacyPill, SampleBadge, SeasonPill, Skeleton, StatsHeaderRow, TilesRow } from '@/components/stats/parts';
import { SeasonSheet } from '@/components/stats/SeasonSheet';
import { useStatsData } from '@/components/stats/useStats';
import { seasonLabel } from '@/data/stats';
import { ALL_TIME, type DogRow } from '@/data/statsCharts';
import { flags } from '@/lib/flags';
import { formatDay } from '@/lib/time';
import { colors, fonts, profileBottomPad, radius, space } from '@/theme/tokens';

export const scopeLabel = (scope: string) => (scope === ALL_TIME ? 'All time' : `${seasonLabel(scope)} season`);

/** Profile › Stats: four tiles, bests, then six private charts. Everything is computed on this phone. */
export default function StatsScreen() {
  const { sample: sampleParam } = useLocalSearchParams<{ sample?: string }>();
  const sample = sampleParam === '1';
  const d = useStatsData(sample);
  const m = d.model;
  const [sheet, setSheet] = useState(false);
  const win = useWindowDimensions();
  const chartW = Math.min(win.width, 560) - space.lg * 2 - 30;
  const go = (chart: string) => router.push({ pathname: '/profile/stats/[chart]', params: { chart, ...(sample ? { sample: '1' } : {}) } });
  const allTime = d.scope === ALL_TIME;
  const compare = d.multiYear && m.days.lastTotal !== null;
  const dogMax = (rows: DogRow[]) => ({ points: Math.max(...rows.map((r) => r.points), 1), flushes: Math.max(...rows.map((r) => r.flushes), 1), retrieves: Math.max(...rows.map((r) => r.retrieves), 1) });
  const share = flags.statsShare && m.state !== 'empty';

  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile" title="Stats" right={share ? <ShareButton sample={sample} /> : undefined} />
      <ScrollView contentContainerStyle={styles.body} testID="season-stats">
        {sample && <SampleBadge />}
        {!d.online && (
          <View testID="stats-offline">
            <Notice>No signal. Stats use hunts on this phone{d.pending ? `, including ${d.pending} waiting to sync` : ''}.</Notice>
          </View>
        )}
        {d.guest && (
          // Review tweak 15: the sign-in card lives once, on Profile root. Pushed pages get a 1-line note (the note itself is the 56pt tap target).
          <Pressable accessibilityRole="link" accessibilityLabel="On this phone only. Sign in to save your stats to your account" onPress={() => router.push('/sign-in')} style={styles.guestNote} testID="stats-guest-note">
            <Text style={styles.cap} numberOfLines={1}>On this phone only. <Text style={styles.guestLink}>Sign in to save ›</Text></Text>
          </Pressable>
        )}
        {d.restoring && !d.loading && (
          <View testID="stats-restoring"><Notice>Restoring your hunts from your account…</Notice></View>
        )}
        {d.restoreFailed && (
          <View style={{ gap: space.sm }} testID="stats-restore-failed">
            <Notice>Could not reach your account to restore your hunts yet. Stats use the hunts on this phone for now.</Notice>
            <Button label="Try again" icon="refresh" onPress={d.retryRestore} />
          </View>
        )}
        <StatsHeaderRow left={<SeasonPill label={scopeLabel(d.scope)} onPress={() => setSheet(true)} />} right={<PrivacyPill />} />

        {d.loading ? (
          <View style={{ gap: space.md }} testID="stats-loading" accessibilityLabel="Loading your stats" accessibilityLiveRegion="polite">
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ flex: 1 }}><Skeleton h={80} /></View>
              ))}
            </View>
            <Skeleton h={230} />
            <Skeleton h={150} />
          </View>
        ) : d.error ? (
          <View style={{ gap: space.sm }}>
            <Notice tone="error">Could not read your hunts on this phone. {d.error.message}</Notice>
            <Button label="Try again" icon="refresh" onPress={() => d.reload()} />
          </View>
        ) : (
          <>
            {m.state === 'empty' ? (
              <EmptyState scope={d.scope} allTime={allTime} guest={d.guest} />
            ) : (
              <>
                <TilesRow tiles={m.tiles} />
                {m.bests.length > 0 && (
                  <View style={styles.bests} testID="stats-bests">
                    {m.bests.map((b) => (
                      <View key={b.key} style={styles.best} accessible accessibilityLabel={`${b.label}: ${b.value}, ${formatDay(b.date)}`}>
                        <Text style={styles.bestValue}>{b.value}</Text>
                        <Text style={styles.bestLabel}>{b.label}</Text>
                        <Text style={styles.bestDate}>{formatDay(b.date)}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {m.gates.days.ready && (
                  <ChartCard testID="stats-card-days" title={allTime ? 'Days afield by season' : 'Days afield by month'} insight={m.days.insight} summary={m.days.a11y} note={`${m.days.note} · tap for details`} onDetails={() => go('days')} table={m.days.table}>
                    <MonthBars bars={m.days.bars} compare={compare} selected={null} width={chartW} />
                    <View style={styles.legend}>
                      <Swatch kind="solid" label={allTime ? 'Days' : seasonLabel(d.scope)} />
                      {compare && <Swatch kind="hatch" label={`${seasonLabel(prev(d.scope))} (hatched)`} />}
                    </View>
                  </ChartCard>
                )}
                {!allTime && m.calendar && m.gates.calendar.ready && (
                  <ChartCard testID="stats-card-calendar" title="Season calendar" insight={m.calendar.insight} summary={m.calendar.a11y} note={`From ${m.calendar.total} hunt ${m.calendar.total === 1 ? 'day' : 'days'} · tap for details`} onDetails={() => go('calendar')} table={{ headers: ['Month', 'Days'], rows: m.calendar.months.map((mo) => [mo.title.slice(0, 1) + mo.title.slice(1, 3).toLowerCase() + ' ' + mo.title.slice(-4), String(mo.cells.filter((c) => c && c.hunts > 0).length)]) }}>
                    <CalendarHeat cal={m.calendar} width={chartW} />
                    <HeatLegend />
                  </ChartCard>
                )}
                {m.gates.species.ready ? (
                  <ChartCard testID="stats-card-species" title="What you hunted" insight={m.species.insight} summary={m.species.a11y} note={m.species.note} onDetails={() => go('species')} table={m.species.table}>
                    <HBars items={speciesItems(m.species.rows.slice(0, 5))} />
                  </ChartCard>
                ) : (
                  <LockedCard testID="stats-locked-species" title="What you hunted" hint={m.gates.species.hint} have={m.gates.species.have} need={m.gates.species.need} />
                )}
                {!allTime &&
                  (m.gates.flush.ready && m.flush ? (
                    <ChartCard testID="stats-card-flush" title="Flushes per hour" insight={m.flush.insight} summary={m.flush.a11y} note={m.flush.note} onDetails={() => go('flush')} table={m.flush.table}>
                      <FlushDots chart={m.flush} selected={null} width={chartW} />
                      <FlushLegend />
                    </ChartCard>
                  ) : (
                    <LockedCard testID="stats-locked-flush" title="Flushes per hour" hint={m.gates.flush.hint} have={m.gates.flush.have} need={m.gates.flush.need} />
                  ))}
                {m.gates.places.ready && (
                  <ChartCard testID="stats-card-places" title="Places" insight={m.places.insight} summary={m.places.a11y} note="No map and no coordinates: only place names and counts." onDetails={() => go('places')} table={m.places.table}>
                    <HBars items={placeItems(m.places.rows.slice(0, 5))} />
                  </ChartCard>
                )}
                {m.dogs && m.dogs.rows.length > 0 && (
                  <ChartCard testID="stats-card-dogs" title="Dog work" insight={m.dogs.insight} summary={m.dogs.a11y} onDetails={() => go('dogs')} table={m.dogs.table}>
                    <View style={{ gap: space.md }}>
                      {m.dogs.rows.slice(0, 3).map((r) => (
                        <View key={r.dogId}>
                          <Text style={styles.dogName}>{r.name.toUpperCase()}<Text style={styles.dogSub}>{`  ${r.breed ? `${r.breed} · ` : ''}${r.hunts} ${r.hunts === 1 ? 'hunt' : 'hunts'}`}</Text></Text>
                          <DogBars dog={r} max={dogMax(m.dogs!.rows)} width={chartW} />
                        </View>
                      ))}
                    </View>
                    <View style={styles.legend}>
                      <Swatch kind="solid" label="solid = points" />
                      <Swatch kind="hatch" label="hatched = flushes" />
                      <Swatch kind="dots" label="dotted = retrieves" />
                    </View>
                  </ChartCard>
                )}
                {m.state === 'few' && <Text style={styles.cap}>Real data. Charts fill in as you log.</Text>}
              </>
            )}
            <View style={styles.footer}>
              <Text style={styles.cap}>
                {d.signedIn
                  ? 'Your stats come from your hunt log, which is saved to your account and restored when you sign in on a new phone. They are private to you: no coordinates, no live location, no rankings.'
                  : 'Your stats come from the hunts on this phone. Sign in to save them to your account. They are private to you: no coordinates, no live location, no rankings.'}
              </Text>
              {sample ? (
                <Button label="Back to my stats" icon="arrow-back" onPress={() => router.replace('/profile/stats')} />
              ) : (
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profile/stats', params: { sample: '1' } })} style={styles.sampleLink} testID="stats-sample-link">
                  <Text style={styles.sampleLinkText}>Preview with sample data ›</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <SeasonSheet visible={sheet} onClose={() => setSheet(false)} onPick={d.setScope} scope={d.scope} seasons={d.seasons} current={d.current} entries={d.entries} multiYear={d.multiYear} />
    </View>
  );
}

const prev = (season: string) => `${Number(season.slice(0, 4)) - 1}-${String(Number(season.slice(0, 4)) % 100).padStart(2, '0')}`;

function ShareButton({ sample }: { sample: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Share season card" onPress={() => router.push({ pathname: '/profile/stats/share', params: sample ? { sample: '1' } : {} })} style={styles.iconBtn} testID="stats-share">
      <Ionicons name="share-outline" size={20} color={colors.text} />
    </Pressable>
  );
}

function EmptyState({ scope, allTime, guest }: { scope: string; allTime: boolean; guest: boolean }) {
  return (
    <View style={{ gap: space.md }} testID="stats-empty">
      <View style={styles.empty}>
        <Ionicons name="trail-sign-outline" size={36} color={colors.accent} />
        <Text style={styles.emptyTitle} accessibilityRole="header">{allTime ? 'No hunts yet' : 'Your season starts here'}</Text>
        <Text style={styles.emptyBody}>Log a hunt and BirdBrain builds your days afield, a season calendar, flush rates and more. All of it is private to you{guest ? ', and saved to your account once you sign in' : ' and saved to your account'}.</Text>
        <Button label="Log your first hunt" variant="primary" icon="add" onPress={() => router.push('/new/log')} />
      </View>
      <Text style={styles.sectionLabel}>What you will see</Text>
      <LockedCard ghost testID="stats-ghost-days" title="Days afield by month" hint="Fills in after your first hunt." have={0} need={1} />
      <LockedCard ghost testID="stats-ghost-calendar" title="Season calendar" hint="Every hunt day, one square each." have={0} need={1} />
      <Text style={styles.cap}>{scope === ALL_TIME ? '' : `Showing ${scopeLabel(scope)}.`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: profileBottomPad, gap: space.md },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xs },
  cap: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted },
  bests: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  best: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  bestValue: { fontFamily: fonts.heading, fontSize: 24, color: colors.dove },
  bestLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  bestDate: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  dogName: { fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginBottom: 2 },
  dogSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  guestNote: { minHeight: 56, justifyContent: 'center' },
  guestLink: { fontFamily: fonts.bodySemi, color: colors.accent },
  account: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  accountText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  footer: { gap: space.sm },
  sampleLink: { minHeight: 44, justifyContent: 'center' },
  sampleLinkText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.accent },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.sm, padding: space.lg, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.text },
  emptyBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.subtle, textAlign: 'center' },
  sectionLabel: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
});
