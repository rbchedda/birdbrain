import { Linking, StyleSheet, Text, View } from 'react-native';

import { ui } from '@/components/ui';
import { legal } from '@/lib/env';
import { colors, space } from '@/theme/tokens';

/** Privacy policy and terms links (placeholder URLs, see lib/env.ts). */
export function LegalLinks() {
  return (
    <View style={styles.row}>
      <Text accessibilityRole="link" style={[ui.muted, styles.link]} onPress={() => Linking.openURL(legal.privacyPolicyUrl)}>
        Privacy Policy
      </Text>
      <Text style={ui.muted}>·</Text>
      <Text accessibilityRole="link" style={[ui.muted, styles.link]} onPress={() => Linking.openURL(legal.termsUrl)}>
        Terms of Service
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'center', marginTop: space.md },
  link: { color: colors.text, textDecorationLine: 'underline' },
});
