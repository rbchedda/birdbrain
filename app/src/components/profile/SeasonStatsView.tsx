import { StyleSheet, Text, View } from 'react-native';

import { SectionTitle, ui } from '@/components/ui';
import { seasonLabel, type SeasonStats } from '@/data/stats';
import { colors, fonts, space } from '@/theme/tokens';

import { StatTiles } from './StatTiles';

const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

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
      <Text style={ui.muted}>
        {`${stats.hours} hours · ${stats.miles} miles · ${stats.shots} shots · ${stats.counties} counties · ${stats.dogRetrieves} retrieves`}
      </Text>
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
