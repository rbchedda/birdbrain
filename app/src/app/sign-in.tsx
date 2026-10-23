import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { AgeGate } from '@/components/AgeGate';
import { LegalLinks } from '@/components/LegalLinks';
import { ScreenHeader } from '@/components/Screen';
import { Button, Chip, Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import { reportSignal } from '@/lib/connectivity';
import { copy, isNetworkError, pendingHunts, setFlags, signInDidNotFinish } from '@/lib/fieldDraft';
import { syncConsentOnSignIn } from '@/lib/termsConsent';
import { needsUsername } from '@/lib/username';
import { colors, space } from '@/theme/tokens';

/** Matches the hosted auth password_min_length; older 6–7 char passwords still sign in. */
const MIN_NEW_PASSWORD = 8;

export default function SignInScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | null>(null);
  const params = useLocalSearchParams<{ message?: string }>();
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | undefined>(
    params.message ? { tone: 'info', text: params.message } : undefined,
  );

  // Leaving without finishing (Back) keeps the hunt and shows the 06 toast.
  const finished = useRef(false);
  useEffect(
    () => () => {
      if (!finished.current) void signInDidNotFinish();
    },
    [],
  );
  const done = (chooseUsername = false) => {
    finished.current = true;
    void setFlags({ signInFailed: false, confirmPending: false }).catch(() => undefined);
    // Replace (not push) so leaving the username step returns to any pending first-save flow.
    if (chooseUsername) return router.replace('/username');
    return router.canGoBack() ? router.back() : router.replace('/feed');
  };
  const checkUsername = async () => {
    const s = await backend.getSession().catch(() => null);
    return needsUsername(s?.userId);
  };

  const submit = async () => {
    setBusy('email');
    setMessage(undefined);
    try {
      if (mode === 'in') {
        await backend.signIn(email.trim(), password);
        await syncConsentOnSignIn().catch(() => undefined);
        // Show that it worked before leaving, so sign-in never looks like 'nothing happened'.
        setMessage({ tone: 'success', text: `Signed in as ${email.trim()}. Saved hunts will sync.` });
        const choose = await checkUsername();
        setTimeout(() => done(choose), 1200);
      } else {
        const { needsConfirmation } = await backend.signUp(email.trim(), password);
        if (needsConfirmation) {
          // No deep link needed: the hunt stays on the phone and syncs whenever a session exists.
          const pending = (await pendingHunts().catch(() => [])).length > 0;
          if (pending) await setFlags({ confirmPending: true }).catch(() => undefined);
          setMessage({ tone: 'success', text: pending ? copy.confirmPending : 'Check your email to confirm, then sign in.' });
          if (pending) setMode('in');
        }
        else {
          await syncConsentOnSignIn().catch(() => undefined);
          done(await checkUsername());
        }
      }
    } catch (e) {
      const pending = (await pendingHunts().catch(() => [])).length > 0;
      if (isNetworkError(e)) {
        // Spec 03: no error state; the hunt waits and the chip turns orange when signal returns.
        reportSignal(false);
        setMessage({ tone: 'info', text: pending ? copy.savedOffline : 'No signal. Try again when you have service.' });
      } else setMessage({ tone: 'error', text: (e as Error)?.message || 'Sign-in didn’t work. Please try again.' });
      if (pending) await setFlags({ signInFailed: true }).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };


  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={mode === 'in' ? 'Sign in' : 'Create account'} back />
      <AgeGate>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {backend.mode === 'sample' && <Notice>Sample mode: you’re already signed in as a local test hunter.</Notice>}
        <Text style={ui.muted}>Know what was stocked, what’s open today, and share your hunts without burning your spot.</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={ui.input}
          accessibilityLabel="Email"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          style={ui.input}
          accessibilityLabel="Password"
          onSubmitEditing={submit}
        />
        {mode === 'up' && password.length > 0 && password.length < MIN_NEW_PASSWORD && (
          <Text style={ui.muted}>Use at least {MIN_NEW_PASSWORD} characters.</Text>
        )}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <Button
          label={mode === 'in' ? 'Sign in' : 'Create account'}
          variant="primary"
          disabled={!email.includes('@') || password.length < (mode === 'up' ? MIN_NEW_PASSWORD : 6)}
          busy={busy === 'email'}
          onPress={submit}
        />
        <Chip
          label={mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
          onPress={() => setMode(mode === 'in' ? 'up' : 'in')}
        />
        <Text style={ui.muted}>No account needed to browse the map, stocking, hours, regs or the Guide.</Text>
        <Text style={ui.muted}>By continuing you agree to the Terms of Service and Privacy Policy.</Text>
        <LegalLinks />
      </ScrollView>
      </AgeGate>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
});
