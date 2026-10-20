import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, space } from '@/theme/tokens';

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

export function Placeholder({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: colors.ground },
  title: { fontFamily: fonts.heading, fontSize: 34, color: colors.text },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
});
