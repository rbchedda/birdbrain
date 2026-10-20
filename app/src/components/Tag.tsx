import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/theme/tokens';

type Tone = 'accent' | 'dove' | 'neutral';

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View style={[styles.tag, toneStyles[tone].box]}>
      <Text style={[styles.text, toneStyles[tone].text]}>{label}</Text>
    </View>
  );
}

const toneStyles = {
  accent: StyleSheet.create({ box: { backgroundColor: colors.accent }, text: { color: colors.onAccent } }),
  dove: StyleSheet.create({ box: { backgroundColor: colors.dove }, text: { color: colors.onDove } }),
  neutral: StyleSheet.create({
    box: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
    text: { color: colors.text },
  }),
};

const styles = StyleSheet.create({
  tag: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  text: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.3 },
});
