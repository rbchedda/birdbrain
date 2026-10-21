import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { AccountSettings, ProfileSettings } from '@/components/profile';
import { colors, space } from '@/theme/tokens';

export default function SettingsScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader back title="Settings" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ProfileSettings />
        <AccountSettings />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
});
