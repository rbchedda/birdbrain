import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Profile menu row: icon tile, short label, one-line live summary and a
 * chevron. The whole row is one tap target that pushes a full-screen page
 * (stack navigation, back arrow on the new page).
 */
export function MenuRow({
  icon,
  label,
  summary,
  href,
  testID,
  compact,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  summary: string;
  href: Href;
  testID?: string;
  /** Secondary rows (Trophies, Life list): smaller, no accent tile. */
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${summary}`}
      accessibilityHint={`Opens ${label}`}
      onPress={() => router.push(href)}
      style={({ pressed }) => [s.row, compact && s.compact, pressed && s.pressed]}
      testID={testID}
    >
      <View style={[s.tile, compact && s.tileCompact]}>
        <Ionicons name={icon} size={compact ? 20 : 24} color={compact ? colors.dove : colors.accent} />
      </View>
      <View style={s.text}>
        <Text style={[s.label, compact && s.labelCompact]} numberOfLines={1}>{label}</Text>
        <Text style={s.summary} numberOfLines={1}>{summary}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  compact: { minHeight: 56 },
  pressed: { backgroundColor: colors.surfaceRaised },
  tile: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  tileCompact: { width: 36, height: 36 },
  text: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.headingSemi, fontSize: 20, color: colors.text },
  labelCompact: { fontSize: 17 },
  summary: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
});
