import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { LifeListView, useProfileData } from '@/components/profile';
import { colors, space } from '@/theme/tokens';

export default function Screen() {
  const p = useProfileData();
  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile" title="Life list" subtitle="Private · only you" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <LifeListView items={p.life} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
});
