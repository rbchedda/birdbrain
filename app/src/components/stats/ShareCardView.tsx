import { StyleSheet, Text, View } from 'react-native';

import type { ShareCard } from '@/data/statsCharts';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** The only things a card can say. No places, dates, dogs, bird totals, shots, coordinates or weather. */
export function shareText(c: ShareCard): string {
  return `${c.seasonLabel} season${c.through ? ` through ${c.through}` : ''}: ${c.days} days afield, ${c.flushes} flushes, ${c.hours} hours, ${c.gameLands} game lands, ${c.varietyCount} kinds of bird. Built with BirdBrain.`;
}

export function ShareCardView({ card }: { card: ShareCard }) {
  const max = Math.max(...card.months.map((m) => m.days), 1);
  return (
    <View style={s.card} testID="share-card" accessibilityLabel={shareText(card)}>
      <Text style={s.kicker}>{`${card.seasonLabel} season${card.through ? ` · through ${card.through}` : ''}`}</Text>
      <View style={s.grid}>
        {[
          [card.days, 'days afield'],
          [card.flushes, 'flushes'],
          [card.hours, 'hours'],
          [card.gameLands, 'game lands'],
        ].map(([v, l]) => (
          <View key={String(l)} style={s.cell}>
            <Text style={s.value}>{String(v)}</Text>
            <Text style={s.label}>{String(l)}</Text>
          </View>
        ))}
      </View>
      <Text style={s.label}>{`${card.varietyCount} kinds of bird`}</Text>
      <View style={s.bars} accessibilityElementsHidden>
        {card.months.map((m, i) => (
          <View key={i} style={s.barCol}>
            <View style={[s.bar, { height: 4 + (m.days / max) * 52 }]} />
            <Text style={s.letter}>{m.letter}</Text>
          </View>
        ))}
      </View>
      <Text style={s.brand}>BIRDBRAIN</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { width: '44%' },
  value: { fontFamily: fonts.heading, fontSize: 40, color: colors.accent },
  label: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, height: 80 },
  barCol: { flex: 1, alignItems: 'center' },
  bar: { width: '100%', backgroundColor: colors.accent, borderRadius: 3 },
  letter: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  brand: { fontFamily: fonts.heading, fontSize: 14, letterSpacing: 2, color: colors.muted, alignSelf: 'flex-end' },
});
