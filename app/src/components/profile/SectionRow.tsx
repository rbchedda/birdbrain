import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

/** Profile hub row: tan title, one-line summary, opens a stack screen. */
export function SectionRow({ title, summary, href, tone = 'dove' }: { title: string; summary: string; href: Href; tone?: 'dove' | 'muted' | 'danger' }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${summary}`} onPress={() => router.push(href)} style={styles.row}>
      <Text style={[styles.title, tone === 'muted' && { color: colors.muted }]}>{title.toUpperCase()}</Text>
      <Text style={[styles.summary, tone === 'danger' && { color: colors.danger }]}>{summary} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: touchTarget, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 2 },
  title: { fontFamily: fonts.headingSemi, fontSize: 15, letterSpacing: 0.5, color: colors.dove },
  summary: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
});
