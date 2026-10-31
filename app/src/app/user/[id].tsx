import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PostCard } from '@/components/PostCard';
import { ScreenHeader } from '@/components/Screen';
import { OfflineBanner, useOnline } from '@/components/States';
import { isNetworkError } from '@/lib/connectivity';
import { ReportSheet } from '@/components/Sheets';
import { SignInPrompt } from '@/components/SignInPrompt';
import { Button, Notice, SectionTitle, ui } from '@/components/ui';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { displayName, type ReportTarget } from '@/data/types';
import { colors, space } from '@/theme/tokens';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const profile = useAsync(() => (session ? backend.profile(id) : Promise.resolve(null)), [id, session]);
  const posts = useAsync(() => (session ? backend.postsBy(id) : Promise.resolve([])), [id, session]);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string>();
  const online = useOnline();

  useEffect(() => {
    if (session && id === session.userId) router.replace('/profile');
  }, [session, id]);

  if (session === null) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Hunter" back />
        <SignInPrompt why="Sign in to see hunter profiles." />
      </View>
    );
  }
  const p = profile.data;
  const toggleBlock = async () => {
    try {
      await backend.setBlocked(id, !blocked);
      setBlocked(!blocked);
      setError(undefined);
      posts.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={p ? displayName(p) : 'Hunter'} subtitle={p?.username ? `@${p.username}` : undefined} back />
      <ScrollView contentContainerStyle={styles.body}>
        {(!online || (!!profile.error && isNetworkError(profile.error))) ? (
          <OfflineBanner testID="user-offline">{p ? 'you can read what’s loaded. Blocking and reports wait for signal.' : 'this profile loads when you’re back in range.'}</OfflineBanner>
        ) : (
          !profile.loading && !p && <Notice>This profile isn’t available.</Notice>
        )}
        {p && (
          <View style={ui.row}>
            <Button
              label={blocked ? 'Unblock' : 'Block'}
              icon="remove-circle-outline"
              variant={blocked ? 'secondary' : 'danger'}
              onPress={toggleBlock}
              style={{ flex: 1 }}
            />
            <Button label="Report" icon="flag-outline" onPress={() => setReport({ kind: 'profile', id })} style={{ flex: 1 }} />
          </View>
        )}
        {blocked && <Notice tone="success">Blocked. Neither of you will see the other’s posts or comments.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {p && !blocked && (
          <>
            <SectionTitle>Posts</SectionTitle>
            {posts.data?.length === 0 && <Text style={ui.muted}>No public posts yet.</Text>}
            {posts.data?.map((post) => (
              <PostCard key={post.id} post={post} onBlocked={() => setBlocked(true)} />
            ))}
          </>
        )}
      </ScrollView>
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
});
