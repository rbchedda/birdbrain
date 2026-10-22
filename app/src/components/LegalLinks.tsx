import { router } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { ui } from '@/components/ui';
import { legal } from '@/lib/env';
import { colors, space } from '@/theme/tokens';

/** Privacy policy and terms links (placeholder URLs, see lib/env.ts), plus Guide photo credits on Profile. */
export function LegalLinks({ credits = false }: { credits?: boolean }) {
  return (
    <View style={styles.row}>
      <Text accessibilityRole="link" style={[ui.muted, styles.link]} onPress={() => Linking.openURL(legal.privacyPolicyUrl)}>
        Privacy Policy
      </Text>
      <Text style={ui.muted}>·</Text>
      <Text accessibilityRole="link" style={[ui.muted, styles.link]} onPress={() => router.push('/terms')}>
        Terms of Service
      </Text>
      {credits && (
        <>
          <Text style={ui.muted}>·</Text>
          <Text accessibilityRole="link" style={[ui.muted, styles.link]} onPress={() => router.push('/guide/credits')}>
            Photo credits
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'center', marginTop: space.md },
  link: { color: colors.text, textDecorationLine: 'underline' },
});
