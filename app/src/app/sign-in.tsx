import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { AgeGate } from '@/components/AgeGate';
import { LegalLinks } from '@/components/LegalLinks';
import { ScreenHeader } from '@/components/Screen';
import { Button, Chip, Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import { syncConsentOnSignIn } from '@/lib/consent';
import { colors, space } from '@/theme/tokens';

export default function SignInScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string }>();

  const done = () => (router.canGoBack() ? router.back() : router.replace('/feed'));

  const submit = async () => {
    setBusy('email');
    setMessage(undefined);
    try {
      if (mode === 'in') {
        await backend.signIn(email.trim(), password);
        await syncConsentOnSignIn().catch(() => undefined);
        done();
      } else {
        const { needsConfirmation } = await backend.signUp(email.trim(), password);
        if (needsConfirmation) setMessage({ tone: 'success', text: 'Check your email to confirm, then sign in.' });
        else {
          await syncConsentOnSignIn().catch(() => undefined);
          done();
        }
      }
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
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
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <Button
          label={mode === 'in' ? 'Sign in' : 'Create account'}
          variant="primary"
          disabled={!email.includes('@') || password.length < 6}
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
