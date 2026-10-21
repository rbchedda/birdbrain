import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/components/ui';
import type { Badge, DogStats, SeasonStats } from '@/data/stats';
import { recap } from '@/data/stats';
import { colors, fonts, radius, space } from '@/theme/tokens';

export const badgesSummary = (badges: Badge[]) => `${badges.filter((b) => b.earned).length} of ${badges.length} earned · Season recap card`;

/** Field-patch badges: tan stitching + orange dot when earned, gray when not. */
export function BadgeGrid({ badges }: { badges: Badge[] }) {
  return (
    <View style={styles.grid} testID="badges">
      {badges.map((b) => (
        <View
          key={b.id}
          style={styles.cell}
          accessible
          accessibilityLabel={`${b.name}: ${b.earned ? 'earned' : b.tracked ? 'not earned yet' : 'coming soon'}. ${b.rule}`}
        >
          <View style={[styles.patch, { borderColor: b.earned ? colors.dove : colors.border }]}>
            {b.earned && <View style={styles.dot} />}
          </View>
          <Text style={[styles.name, !b.earned && { color: colors.muted }]} numberOfLines={2}>
            {b.name.toUpperCase()}
          </Text>
          <Text style={styles.rule} numberOfLines={2}>
            {b.tracked ? (b.progress ? `${b.rule} · ${b.progress}` : b.rule) : `${b.rule} · coming soon`}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Season recap preview. Effort and dog work only; bird totals hidden, no pins. */
export function RecapPreview({ stats, dogs }: { stats: SeasonStats; dogs: DogStats[] }) {
  const r = recap(stats, dogs);
  return (
    <View style={styles.recap} testID="recap-card">
      <Text style={[styles.big, { color: colors.accent }]}>{r.headline[0]}</Text>
      <Text style={styles.big}>{r.headline[1]}</Text>
      {r.headline[2] && <Text style={[styles.big, { color: colors.dove }]}>{r.headline[2]}</Text>}
      <Text style={ui.muted}>{r.subline}</Text>
      <View style={styles.map}>
        <Text style={ui.muted}>County map (no pins)</Text>
      </View>
      <Text style={ui.muted}>Bird totals hidden</Text>
      <Text style={[ui.muted, { fontSize: 12 }]}>Effort & variety only. No kill leaderboards. Sharing 9:16 / 1:1 cards comes later.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { width: '31%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.sm, alignItems: 'center', gap: 4 },
  patch: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed' },
  dot: { position: 'absolute', right: -2, top: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
  name: { fontFamily: fonts.headingSemi, fontSize: 13, color: colors.text, textAlign: 'center' },
  rule: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, textAlign: 'center' },
  recap: { backgroundColor: colors.surface, borderColor: colors.dove, borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: space.xs },
  big: { fontFamily: fonts.heading, fontSize: 30, color: colors.text },
  map: { height: 90, borderRadius: radius.sm, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', marginVertical: space.sm },
});
