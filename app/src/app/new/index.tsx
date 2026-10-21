import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

type Choice = {
  title: string;
  body: string;
  tag: string;
  icon: keyof typeof Ionicons.glyphMap;
  mode: 'diary' | 'post';
};

const choices: Choice[] = [
  {
    title: 'Log hunt',
    body: 'Saves privately to your Hunt Log. Never posted. Only you see it.',
    tag: 'Private',
    icon: 'lock-closed-outline',
    mode: 'diary',
  },
  {
    title: 'Post',
    body: 'Share with hunters. Appears 12+ hrs after the hunt, location blurred.',
    tag: 'Delayed',
    icon: 'time-outline',
    mode: 'post',
  },
];

/** ＋ chooser: "Log hunt" (private diary, never a post) or "Post" (delayed social post). */
export default function NewChooser() {
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const pick = (mode: Choice['mode']) => router.replace(mode === 'post' ? '/new/post' : '/new/log');

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={close} />
      <View style={styles.sheet}>
        <Text style={styles.title} accessibilityRole="header">
          What are you adding?
        </Text>
        {choices.map((c) => (
          <Pressable
            key={c.mode}
            accessibilityRole="button"
            accessibilityLabel={c.title}
            onPress={() => pick(c.mode)}
            style={({ pressed }) => [styles.choice, pressed && { opacity: 0.85 }]}
            testID={`choose-${c.mode}`}
          >
            <Ionicons name={c.icon} size={24} color={colors.accent} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.choiceTitle}>{c.title}</Text>
              <Text style={styles.body}>{c.body}</Text>
            </View>
            <Text style={styles.tag}>{c.tag}</Text>
          </Pressable>
        ))}
        <Button label="Cancel" onPress={close} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.text, textTransform: 'uppercase' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touchTarget,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ground,
  },
  choiceTitle: { fontFamily: fonts.headingSemi, fontSize: 20, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  tag: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.dove },
});
