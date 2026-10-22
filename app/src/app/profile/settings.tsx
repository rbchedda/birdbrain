import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { AccountSettings, ProfileSettings, SectionRow } from '@/components/profile';
import { Button, SectionTitle } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

export default function SettingsScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader back title="Settings" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SectionRow title="Season stats" summary="flushes, shots, points by month" href="/profile/stats" />
        <ProfileSettings />
        <AccountSettings />
        <SectionTitle>Legal</SectionTitle>
        <Button label="Terms of Service: Maps, Data and Your Responsibility" icon="document-text-outline" onPress={() => router.push('/terms')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
});
