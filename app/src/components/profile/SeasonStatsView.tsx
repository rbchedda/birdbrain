import { StyleSheet, Text, View } from 'react-native';

import { SectionTitle, ui } from '@/components/ui';
import { seasonLabel, type SeasonStats } from '@/data/stats';
import { colors, fonts, space } from '@/theme/tokens';

import { StatTiles } from './StatTiles';

const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

/** "16.5 hours · 3 miles · …" with every 0-valued item hidden (review tweak 13: no "0 counties"). */
export function summaryLine(stats: Pick<SeasonStats, 'hours' | 'miles' | 'shots' | 'counties' | 'dogRetrieves'>): string {
  const items: [number, string, string][] = [
    [stats.hours, 'hour', 'hours'],
    [stats.miles, 'mile', 'miles'],
    [stats.shots, 'shot', 'shots'],
    [stats.counties, 'county', 'counties'],
    [stats.dogRetrieves, 'retrieve', 'retrieves'],
  ];
  return items
    .filter(([v]) => v > 0)
    .map(([v, one, many]) => `${v} ${v === 1 ? one : many}`)
    .join(' · ');
}

/** Season stats, led by days afield. Effort only. */
export function SeasonStatsView({ stats }: { stats: SeasonStats }) {
  return (
    <View style={{ gap: space.sm }}>
      <SectionTitle>{`${seasonLabel(stats.season)} season`}</SectionTitle>
      <StatTiles
        testID="season-stats"
        tiles={[
          { label: 'days afield', value: stats.daysAfield },
          { label: 'flushes', value: stats.flushes },
          { label: 'game lands', value: stats.gameLands },
          { label: 'dog points', value: stats.dogPoints },
        ]}
      />
      {summaryLine(stats) !== '' && (
        <Text style={ui.muted} testID="season-summary-line">
          {summaryLine(stats)}
        </Text>
      )}
      {stats.byMonth.length > 0 && (
        <View style={ui.card}>
          <View style={styles.tr}>
            {['Month', 'Days', 'Flushes', 'Shots', 'Points'].map((h) => (
              <Text key={h} style={[styles.td, styles.th]}>
                {h}
              </Text>
            ))}
          </View>
          {stats.byMonth.map((m) => (
            <View key={m.month} style={styles.tr} accessibilityLabel={`${monthName(m.month)}: ${m.days} days, ${m.flushes} flushes, ${m.shots} shots, ${m.points} points`}>
              <Text style={styles.td}>{monthName(m.month)}</Text>
              <Text style={styles.td}>{m.days}</Text>
              <Text style={styles.td}>{m.flushes}</Text>
              <Text style={styles.td}>{m.shots}</Text>
              <Text style={styles.td}>{m.points}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tr: { flexDirection: 'row', paddingVertical: 2 },
  td: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  th: { fontFamily: fonts.bodySemi, color: colors.muted, fontSize: 12 },
});
