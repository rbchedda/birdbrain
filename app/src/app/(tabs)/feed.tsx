import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { PostCard } from '@/components/PostCard';
import { ScreenHeader } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import { useSession } from '@/data/hooks';
import type { Post } from '@/data/types';
import { colors, space, touchTarget } from '@/theme/tokens';

const PAGE = 10;

export default function FeedScreen() {
  const session = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const loadingMore = useRef(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      const page = await backend.feed(null, PAGE);
      setPosts(page.posts);
      setNext(page.next);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  // Reload on focus so a just-logged hunt shows up.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const loadMore = async () => {
    if (!next || loadingMore.current) return;
    loadingMore.current = true;
    setLoading(true);
    try {
      const page = await backend.feed(next, PAGE);
      setPosts((p) => [...p, ...page.posts.filter((x) => !p.some((y) => y.id === x.id))]);
      setNext(page.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loadingMore.current = false;
      setLoading(false);
    }
  };

  const profileButton = (
    <Pressable accessibilityRole="button" accessibilityLabel="My profile" onPress={() => router.push('/profile')} style={styles.profile}>
      <Ionicons name="person-circle-outline" size={30} color={colors.text} />
    </Pressable>
  );

  if (session === null) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Feed" right={profileButton} />
        <SignInPrompt why="The feed is for signed-in hunters. Posts show up the day after they’re shared, with locations blurred to about 5 km." />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Feed" subtitle="Hunts from yesterday and before. Never live." right={profileButton} />
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onBlocked={(authorId) => {
              setPosts((p) => p.filter((x) => x.author.id !== authorId));
              setNotice('Blocked. You won’t see each other’s posts or comments. Undo from your profile.');
            }}
            onDeleted={(id) => setPosts((p) => p.filter((x) => x.id !== id))}
          />
        )}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space.lg }} />}
        ListHeaderComponent={
          <View style={{ gap: space.sm, marginBottom: notice || error ? space.lg : 0 }}>
            {notice && <Notice tone="success">{notice}</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
          </View>
        }
        ListEmptyComponent={
          refreshing ? undefined : <Text style={ui.muted}>No posts yet. Log a hunt and it’ll show here after midnight.</Text>
        }
        ListFooterComponent={loading ? <ActivityIndicator color={colors.accent} style={{ margin: space.lg }} /> : undefined}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  profile: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginRight: -space.sm },
});
