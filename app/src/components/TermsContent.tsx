import { Linking, StyleSheet, Text, View } from 'react-native';

import { ui } from '@/components/ui';
import { TERMS_VERSION, tosSection, tosSectionTitle } from '@/data/terms';
import { legal } from '@/lib/env';
import { colors, fonts, space } from '@/theme/tokens';

/** Terms of Service, section "Maps, Data and Your Responsibility" (memo 4D, verbatim). */
export function TermsContent() {
  return (
    <View style={{ gap: space.md }} testID="tos-maps-data">
      <Text style={styles.heading} accessibilityRole="header">
        {tosSectionTitle}
      </Text>
      {tosSection.map((item, i) => (
        <Text key={item.title} style={ui.body}>
          <Text style={styles.strong}>{`${i + 1}. ${item.title}`}</Text> {item.body}
        </Text>
      ))}
      <Text style={ui.muted}>Terms version {TERMS_VERSION}.</Text>
      <Text accessibilityRole="link" style={[ui.muted, styles.link]} onPress={() => Linking.openURL(legal.termsUrl)}>
        Full Terms of Service
      </Text>
      <Text accessibilityRole="link" style={[ui.muted, styles.link]} onPress={() => Linking.openURL(legal.privacyPolicyUrl)}>
        Privacy Policy
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: fonts.headingSemi, fontSize: 22, color: colors.text },
  strong: { fontFamily: fonts.bodySemi, color: colors.text },
  link: { color: colors.text, textDecorationLine: 'underline' },
});
