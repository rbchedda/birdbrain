import { router, useNavigation, type Href } from 'expo-router';
import { useLayoutEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DigestLink } from '@/components/guide/DigestLink';
import { ScreenHeader } from '@/components/Screen';
import { BEFORE_YOU_GO, BIRD_ROWS, GUIDE_PURPOSE, LEARN, type GuideRow } from '@/data/guideMenu';
import { PGC_DIGEST_URL } from '@/data/regs';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Guide (birdbrain-polish/guide, 01-guide): purpose line, then grouped rows. No bag limits here. */
export default function GuideScreen() {
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions({ title: 'Guide' }), [navigation]);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Guide" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.purpose} testID="guide-purpose">
          {GUIDE_PURPOSE}
        </Text>
        <Group title="Before you go" id="before" rows={BEFORE_YOU_GO} />
        <Group title="Birds" id="birds" rows={BIRD_ROWS} />
        <Group title="Learn" id="learn" rows={LEARN} />

        <Text style={styles.disclaimer} testID="guide-disclaimer">
          Unofficial summary, always verify with the PGC Hunting & Trapping Digest
        </Text>
        <DigestLink testID="guide-digest-top" style={styles.small} />
        <View style={styles.footer}>
          <Text
            accessibilityRole="link"
            accessibilityLabel="Open the PGC Hunting & Trapping Digest"
            style={styles.small}
            onPress={() => Linking.openURL(PGC_DIGEST_URL)}
          >
            PGC Hunting & Trapping Digest ↗
          </Text>
          <Text accessibilityRole="link" style={styles.small} testID="guide-data-sources" onPress={() => router.push('/data-sources')}>
            Data sources
          </Text>
          <Text accessibilityRole="link" style={styles.small} testID="guide-credits" onPress={() => router.push('/guide/credits')}>
            Credits
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Group({ title, id, rows }: { title: string; id: string; rows: GuideRow[] }) {
  return (
    <View testID={`guide-group-${id}`}>
      <Text style={styles.label} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      {rows.map((r, i) => (
        <Pressable
          key={r.key}
          accessibilityRole="button"
          accessibilityLabel={`${r.title}. ${r.desc}`}
          testID={`guide-row-${r.key}`}
          onPress={() => router.push(r.href as Href)}
          style={({ pressed }) => [styles.row, i < rows.length - 1 && styles.divider, pressed && styles.pressed]}
        >
          <View style={styles.icon}>
            <Text style={styles.iconText}>{r.icon}</Text>
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>{r.title}</Text>
            <Text style={styles.desc}>{r.desc}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const GUIDE_ROW_MIN_HEIGHT = 64;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  purpose: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.muted },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.8, color: colors.muted, marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: GUIDE_ROW_MIN_HEIGHT, paddingVertical: space.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { opacity: 0.6 },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.dove },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  desc: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  chev: { fontSize: 20, color: colors.muted },
  disclaimer: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 16, marginTop: space.lg },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, paddingVertical: space.xs },
});
