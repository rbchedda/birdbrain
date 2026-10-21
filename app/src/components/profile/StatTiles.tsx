import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space } from '@/theme/tokens';

/** Row of stat tiles; the first one is the hero (orange). */
export function StatTiles({ tiles, testID }: { tiles: { label: string; value: number | string }[]; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      {tiles.map((t, i) => (
        <View key={t.label} style={styles.tile} accessible accessibilityLabel={`${t.value} ${t.label}`}>
          <Text style={[styles.value, i === 0 && { color: colors.accent }]}>{t.value}</Text>
          <Text style={styles.label}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  value: { fontFamily: fonts.heading, fontSize: 28, color: colors.text },
  label: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});
