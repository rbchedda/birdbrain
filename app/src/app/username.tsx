import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { UsernameForm } from '@/components/UsernameForm';
import { ui } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

/** Shown once after the first sign-in when profiles.username is null. Skippable so it never blocks a saved hunt. */
export default function ChooseUsernameScreen() {
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/feed'));
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Choose your username" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={ui.muted}>This is how other hunters see you. You can change it later in Profile.</Text>
        <UsernameForm onSaved={leave} onSkip={leave} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
});
