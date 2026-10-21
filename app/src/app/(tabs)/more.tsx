import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LegalLinks } from '@/components/LegalLinks';
import { ScreenHeader } from '@/components/Screen';
import { ui } from '@/components/ui';
import { useShareToCommunity } from '@/lib/shareToCommunity';
import { colors, fonts, space, touchTarget } from '@/theme/tokens';

type Row = { label: string; detail?: string; icon: keyof typeof Ionicons.glyphMap; href: Href };

export default function MoreScreen() {
  const sharing = useShareToCommunity();
  const rows: Row[] = [
    { label: 'Profile & settings', icon: 'person-circle-outline', href: '/profile' },
    {
      label: 'Community feed',
      detail: sharing ? 'On' : 'Off',
      icon: 'newspaper-outline',
      href: '/groups?segment=community',
    },
  ];
  return (
    <View style={styles.root}>
      <ScreenHeader title="More" />
      <ScrollView contentContainerStyle={styles.body}>
        {rows.map((r) => (
          <Pressable
            key={r.label}
            accessibilityRole="button"
            accessibilityLabel={r.label}
            onPress={() => router.push(r.href)}
            style={[ui.card, styles.row]}
          >
            <Ionicons name={r.icon} size={22} color={colors.accent} />
            <Text style={styles.label}>{r.label}</Text>
            {r.detail && <Text style={ui.muted}>{r.detail}</Text>}
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
        <LegalLinks />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touchTarget },
  label: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text, flex: 1 },
});
