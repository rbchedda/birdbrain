import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { LegalLinks } from '@/components/LegalLinks';
import { Button, Notice, ui } from '@/components/ui';
import { flags } from '@/lib/flags';
import { acceptTerms } from '@/lib/consent';
import { colors, fonts, space } from '@/theme/tokens';

export const signInSheetTitle = 'Save your hunts so they’re never lost if you switch phones';

/**
 * Shown at the moment of value (first "+ Log hunt" while signed out), never as
 * a launch wall. Sign in with Apple is the primary option once its flag is on
 * (blocked on Apple keys); email is the alternative and, until then, the only one.
 */
export function SignInSheet({ onDismiss, body, appleEnabled = flags.appleSignIn }: { onDismiss: () => void; body?: string; appleEnabled?: boolean }) {
  const [message, setMessage] = useState<string>();
  // Continuing records acceptance on the device; it syncs to accepted_terms after sign-in.
  const accept = () => acceptTerms().catch(() => undefined);

  const email = async () => {
    await accept();
    router.push('/sign-in');
  };
  const apple = async () => {
    await accept();
    // TODO(apple-sign-in): call expo-apple-authentication + supabase signInWithIdToken once keys exist.
    setMessage('Sign in with Apple isn’t available yet. Use email for now.');
  };

  return (
    <View style={[ui.card, { gap: space.md }]} testID="sign-in-sheet" accessibilityViewIsModal>
      <Text style={{ fontFamily: fonts.headingSemi, fontSize: 22, color: colors.text }} accessibilityRole="header">
        {signInSheetTitle}
      </Text>
      <Text style={ui.muted}>{body ?? 'Your Hunt Log is private to you and backed up to your account. Browsing the map, stocking, hours, regs and the Guide never needs an account.'}</Text>
      {appleEnabled && <Button label="Sign in with Apple" icon="logo-apple" variant="primary" onPress={apple} />}
      <Button label={appleEnabled ? 'Use email instead' : 'Continue with email'} icon="mail-outline" variant={appleEnabled ? 'secondary' : 'primary'} onPress={email} />
      {message && <Notice tone="error">{message}</Notice>}
      <Button label="Not now" onPress={onDismiss} />
      <Text style={ui.muted}>By continuing you agree to the Terms of Service and Privacy Policy.</Text>
      <LegalLinks />
    </View>
  );
}
