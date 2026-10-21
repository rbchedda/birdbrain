import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { ui } from '@/components/ui';
import credits from '../../../assets/birds/CREDITS.json';
import { colors, fonts, space } from '@/theme/tokens';

type Credit = { file: string; species: string; title: string; sourceUrl: string; author: string; license: string; licenseUrl: string; retrieved: string; changes: string };

/** Guide › Photo credits: every bundled bird image, from assets/birds/CREDITS.json. */
export default function CreditsScreen() {
  const list = credits as Credit[];
  return (
    <View style={styles.root}>
      <ScreenHeader title="Photo credits" back />
      <ScrollView contentContainerStyle={styles.body}>
        {list.length === 0 && (
          <Text style={ui.body} testID="credits-empty">
            No bird photos are bundled yet; the Guide shows placeholders. Licensed photos (public domain, CC0, CC BY or CC
            BY-SA) and their credits will be listed here.
          </Text>
        )}
        {list.map((c) => (
          <View key={c.file} style={ui.card} testID={`credit-${c.file}`}>
            <Text style={styles.title}>{c.title}</Text>
            <Text style={ui.body}>
              {c.author || 'Public domain'} · {c.license}
            </Text>
            <Text style={ui.muted}>Changes: {c.changes} · retrieved {c.retrieved}</Text>
            <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(c.sourceUrl)}>
              Source ↗
            </Text>
            <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(c.licenseUrl)}>
              License ↗
            </Text>
          </View>
        ))}
        <Text style={ui.muted}>BirdBrain does not use eBird or Macaulay Library media, or AI-generated bird images.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  title: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text },
  link: { color: colors.accent, fontFamily: fonts.bodySemi },
});
