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
      <View style={s.tile}>
        <Ionicons name={icon} size={22} color={colors.accent} />
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
  // Review beta-4.4 tweak 12: 64pt rows, one icon set (22pt line glyph, orange, in a 40pt #264733 tile, radius 10), chevron 20pt with a 16pt right inset.
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingLeft: space.md, paddingRight: space.lg, paddingVertical: space.sm },
  compact: { minHeight: 64 },
  pressed: { backgroundColor: colors.surfaceRaised },
  tile: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.headingSemi, fontSize: 20, color: colors.text },
  labelCompact: { fontSize: 17 },
  summary: { fontFamily: fonts.body, fontSize: 14, color: colors.subtle },
});
