import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { PGC_DIGEST_URL } from '@/data/regs';
import { GUIDE_REGS_VERSION } from '@/data/guideRegs';
import { colors, fonts } from '@/theme/tokens';

/** "Verify with the PGC digest ↗ · regs vX", shown on every Guide section. */
export function DigestLink({ url = PGC_DIGEST_URL, testID, style }: { url?: string; testID?: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel="Verify with the PGC digest"
      onPress={() => Linking.openURL(url)}
      style={[styles.link, style]}
      testID={testID}
    >
      Verify with the PGC digest ↗ <Text style={styles.version}>· regs v{GUIDE_REGS_VERSION}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.accent, fontFamily: fonts.bodySemi, fontSize: 14, paddingVertical: 6 },
  version: { color: colors.muted, fontFamily: fonts.body },
});
