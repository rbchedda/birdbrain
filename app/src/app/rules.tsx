import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { Button, Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { communityRules } from '@/data/moderation';
import { colors, fonts, space } from '@/theme/tokens';

/** Community rules (App Review Guideline 1.2). Signed-in users accept once before using the feed. */
export default function RulesScreen() {
  const session = useSession();
  const accepted = useAsync(() => (session ? backend.rulesAccepted() : Promise.resolve(false)), [session]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const accept = async () => {
    setBusy(true);
    try {
      await backend.acceptRules();
      setError(undefined);
      if (router.canGoBack()) router.back();
      else router.replace('/feed');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Community rules" back />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={ui.body}>
          BirdBrain has zero tolerance for objectionable content or abusive users. Breaking these rules gets content removed and accounts banned.
        </Text>
        {communityRules.map((r, i) => (
          <View key={r.title} style={styles.rule}>
            <Text style={styles.title}>
              {i + 1}. {r.title}
            </Text>
            <Text style={ui.muted}>{r.body}</Text>
          </View>
        ))}
        {error && <Notice tone="error">{error}</Notice>}
        {session === null ? (
          <SignInPrompt why="Sign in to accept the community rules." />
        ) : accepted.data ? (
          <Notice tone="success">You’ve accepted the community rules.</Notice>
        ) : (
          !accepted.loading && <Button label="I agree to the community rules" variant="primary" busy={busy} onPress={accept} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  rule: { gap: space.xs },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
});
