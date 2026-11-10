import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PostCard } from '@/components/PostCard';
import { ScreenHeader } from '@/components/Screen';
import { EmptyState } from '@/components/States';
import { colors, profileBottomPad, space } from '@/theme/tokens';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { SignInPrompt } from '@/components/SignInPrompt';

/**
 * Profile › My posts. The author sees every post immediately, including ones
 * still inside the delay, with the local time each goes live.
 */
export default function MyPostsScreen() {
  const session = useSession();
  const me = session?.userId;
  const signedOut = backend.mode === 'supabase' && !session;
  const list = useAsync(() => (me ? backend.postsBy(me) : Promise.resolve([])), [me]);

  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile" title="My posts" />
      <ScrollView contentContainerStyle={styles.body} testID="my-posts-list">
        {signedOut ? (
          <SignInPrompt why="Sign in to see the posts you’ve shared, including ones that aren’t public yet." />
        ) : list.data && list.data.length === 0 ? (
          <EmptyState
            testID="my-posts-empty"
            icon="chatbubble-ellipses-outline"
            title="No posts yet"
            body="Share a hunt and it lands here right away. Others see it after the delay, then with the exact location you chose to share."
            action={{ label: 'Share a hunt', onPress: () => router.push('/new/post'), testID: 'my-posts-empty-post' }}
          />
        ) : (
          (list.data ?? []).map((post) => (
            <PostCard key={post.id} post={post} onDeleted={() => list.reload()} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: profileBottomPad, gap: space.sm },
});
