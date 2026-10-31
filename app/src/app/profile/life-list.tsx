import { ScrollView, StyleSheet, View } from 'react-native';

import { router } from 'expo-router';

import { ScreenHeader } from '@/components/Screen';
import { EmptyState } from '@/components/States';
import { PrivacyPill } from '@/components/stats/parts';
import { LifeListView, useProfileData } from '@/components/profile';
import { colors, profileBottomPad, space } from '@/theme/tokens';

export default function Screen() {
  const p = useProfileData();
  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile" title="Life list" right={<PrivacyPill testID="page-privacy" />} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {p.data && p.life.length === 0 ? (
          <EmptyState
            testID="life-list-empty"
            icon="list-outline"
            title="Your list is empty"
            body="Every species you log a hunt for gets added here, with the date and place you first hunted it."
            action={{ label: 'Log a hunt', onPress: () => router.push('/new/log') }}
            secondary={{ label: 'Browse birds in Guide', onPress: () => router.push('/guide') }}
          />
        ) : (
          <LifeListView items={p.life} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: profileBottomPad, gap: space.sm },
});
