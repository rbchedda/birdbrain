import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { AccountSettings, ProfileSettings, SectionRow } from '@/components/profile';
import { Button, SectionTitle } from '@/components/ui';
import { colors, profileBottomPad, space } from '@/theme/tokens';

export default function SettingsScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile" title="Settings" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SectionRow title="Stats" summary="days afield, flushes, hours, places and dogs by season" href="/profile/stats" />
        <SectionRow title="Offline maps" summary="basemap packs for game lands with no signal" href="/offline-maps" />
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
  body: { paddingHorizontal: space.lg, paddingBottom: profileBottomPad, gap: space.sm },
});
