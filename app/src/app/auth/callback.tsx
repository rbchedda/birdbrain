import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { backend } from '@/data';
import { syncJournal } from '@/data/journal';
import { authRedirectMessage, parseAuthRedirect } from '@/lib/authRedirect';
import { setFlags, showToast, copy } from '@/lib/fieldDraft';
import { syncConsentOnSignIn } from '@/lib/termsConsent';
import { colors, space } from '@/theme/tokens';

/**
 * Email-confirmation landing (signUp emailRedirectTo). Handles a PKCE `code`
 * or implicit `access_token`/`refresh_token`; any error, expired link or
 * already-confirmed account goes to Sign in with a friendly message.
 * Pending hunts are never touched here except to upload them.
 */
export default function AuthCallback() {
  const query = useLocalSearchParams<Record<string, string>>();
  const url = Linking.useURL();
  const done = useRef(false);
  // A bare callback with no params (and no URL after a moment) still never strands the user.
  useEffect(() => {
    const t = setTimeout(() => {
      if (done.current) return;
      done.current = true;
      router.replace({ pathname: '/sign-in', params: { message: authRedirectMessage({}) } });
    }, 3000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (done.current) return;
    const p = parseAuthRedirect(url, query);
    if (!p.code && !p.accessToken && !p.error && url === null) return; // wait for the URL on native
    done.current = true;
    const toSignIn = (message: string) => router.replace({ pathname: '/sign-in', params: { message } });
    (async () => {
      if (p.error || p.errorCode || p.errorDescription) return toSignIn(authRedirectMessage(p));
      try {
        await backend.completeAuthRedirect(p);
      } catch (e) {
        return toSignIn(authRedirectMessage(e instanceof Error ? e : new Error(String(e))));
      }
      await setFlags({ signInFailed: false, confirmPending: false }).catch(() => undefined);
      await syncConsentOnSignIn().catch(() => undefined);
      const r = await syncJournal(backend, { force: true }).catch(() => null);
      if (r && r.synced > 0) showToast(copy.savedToAccount);
      router.replace('/');
    })().catch(() => toSignIn(authRedirectMessage({})));
  }, [url, query]);
  return (
    <View style={styles.root} testID="auth-callback">
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.text}>Finishing sign-in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', gap: space.md },
  text: { color: '#F2F4EF', fontSize: 16, fontWeight: '600' },
});
