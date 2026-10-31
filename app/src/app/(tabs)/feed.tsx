import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { PostCard } from '@/components/PostCard';
import { ScreenHeader } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { ErrorState, OfflineBanner, SkeletonBlock, useOnline } from '@/components/States';
import { Button, Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import { useCrewSize, useInviteCardDismissed, useMyCrews } from '@/data/crew';
import { useSession } from '@/data/hooks';
import type { Post } from '@/data/types';
import { isNetworkError } from '@/lib/connectivity';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

const PAGE = 10;

type Segment = 'crew' | 'community';

/** Segmented control: My crew | Community (redesign mockup 03). */
function Segments({ value, onChange }: { value: Segment; onChange: (s: Segment) => void }) {
  return (
    <View style={styles.segments} accessibilityRole="tablist">
      {(['crew', 'community'] as const).map((s) => (
        <Pressable
          key={s}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === s }}
          onPress={() => onChange(s)}
          style={[styles.segment, value === s && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, value === s && styles.segmentTextActive]}>{s === 'crew' ? 'My crew' : 'Community'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Zero-crew empty state, shown only on the Crew tab. */
export function CrewEmpty({ onCommunity }: { onCommunity: () => void }) {
  return (
    <View style={styles.empty} testID="crew-empty">
      <View style={styles.illustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="people-outline" size={56} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">Hunt with a crew</Text>
      <Text style={[ui.body, { textAlign: 'center' }]}>
        Start a private crew and invite the people you hunt with by link or QR code. Crew posts show up here 12+ hours after the hunt, with no live locations.
      </Text>
      <Button label="Start or join a crew" icon="person-add-outline" variant="primary" style={{ alignSelf: 'stretch' }} onPress={openCrews} />
      <Pressable accessibilityRole="button" accessibilityLabel="Browse Community" onPress={onCommunity} style={styles.communityCard}>
        <Ionicons name="earth-outline" size={22} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Browse Community</Text>
          <Text style={ui.muted}>Delayed, blurred posts from PA hunters</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const openCrews = () => router.push('/crew/invite');

/** The user's crews, each opening crew/[id]. Falls back to the empty state if the list comes back empty. */
export function CrewList({ onCommunity }: { onCommunity: () => void }) {
  const { crews, error, reload } = useMyCrews();
  useFocusEffect(useCallback(() => reload(), [reload]));
  if (crews === null) return <ActivityIndicator color={colors.accent} style={{ marginTop: space.xl }} />;
  if (!crews.length && !error) return <CrewEmpty onCommunity={onCommunity} />;
  return (
    <View style={styles.crewList} testID="crew-list">
      {error && <Notice tone="error">{error}</Notice>}
      {crews.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`Open crew ${c.name}`}
          onPress={() => router.push({ pathname: '/crew/[id]', params: { id: c.id } })}
          style={styles.communityCard}
        >
          <Ionicons name="people-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{c.name}</Text>
            <Text style={ui.muted}>{c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}{c.role === 'admin' ? ' · admin' : ''}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}
      <Text style={ui.muted}>Crew posts and pins are coming soon.</Text>
      <Button label="Start or join another crew" icon="add-outline" onPress={openCrews} />
    </View>
  );
}

/** Slim, dismissible invite card shown atop Community for users with no crew. */
export function InviteCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={styles.inviteCard} testID="invite-card">
      <Text style={[ui.body, { flex: 1 }]} numberOfLines={1}>Hunt with friends? Invite your crew.</Text>
      <Button label="Invite" icon="person-add-outline" onPress={openCrews} />
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss invite" onPress={onDismiss} style={styles.dismiss}>
        <Ionicons name="close" size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}

/** Loading: skeleton post cards (#1f3328, radius 10), no spinner. */
function FeedSkeleton() {
  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.lg }} testID="feed-loading" accessibilityLabel="Loading feed" accessibilityLiveRegion="polite">
      {[0, 1].map((i) => (
        <View key={i} style={{ gap: space.sm, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
          <SkeletonBlock height={16} width="55%" />
          <SkeletonBlock height={12} width="40%" />
          <SkeletonBlock height={120} />
        </View>
      ))}
    </View>
  );
}

export default function FeedScreen() {
  const session = useSession();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const crew = useCrewSize();
  const [chosen, setSegment] = useState<Segment | null>(null);
  const [inviteDismissed, dismissInvite] = useInviteCardDismissed();
  // ?tab= overrides; then the user's pick; then Crew if they have one, else Community.
  const override: Segment | null = tab === 'community' || tab === 'crew' ? tab : null;
  const segment: Segment = chosen ?? override ?? (crew && crew > 0 ? 'crew' : 'community');
  const invite = crew === 0 && !inviteDismissed ? <InviteCard onDismiss={dismissInvite} /> : null;
  const [posts, setPosts] = useState<Post[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const online = useOnline();
  const [netDown, setNetDown] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const offline = !online || netDown;
  const loadingMore = useRef(false);
  // 'error' fails closed: no posts until we know the rules were accepted.
  const [rules, setRules] = useState<'unknown' | 'accepted' | 'required' | 'error'>('unknown');

  const refresh = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    let ok: boolean;
    try {
      ok = await backend.rulesAccepted();
    } catch (e) {
      setRules('error');
      setError(`Couldn’t check the community rules: ${(e as Error).message}`);
      setRefreshing(false);
      return;
    }
    setRules(ok ? 'accepted' : 'required');
    if (!ok) {
      setError(undefined);
      setRefreshing(false);
      return;
    }
    try {
      const page = await backend.feed(null, PAGE);
      setPosts(page.posts);
      setNext(page.next);
      setError(undefined);
      setNetDown(false);
      setSavedAt(new Date());
    } catch (e) {
      setNetDown(isNetworkError(e));
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

  if (session === null) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Feed" />
        <SignInPrompt why="The feed is for signed-in hunters. Posts show up the day after they’re shared, with locations blurred to about 5 km." />
      </View>
    );
  }

  // Crew has no posts yet, so the empty state doesn't wait on the rules check.
  if (segment === 'crew') {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Feed" />
        <Segments value={segment} onChange={setSegment} />
        {crew && crew > 0 ? <CrewList onCommunity={() => setSegment('community')} /> : <CrewEmpty onCommunity={() => setSegment('community')} />}
      </View>
    );
  }

  if (rules === 'required' || rules === 'error') {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Feed" />
        <Segments value={segment} onChange={setSegment} />
        {invite}
        <View style={styles.gate}>
          {rules === 'required' && <Notice>Before you see or share posts, please read and accept the community rules.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          {rules === 'error' && <Button label="Try again" icon="refresh-outline" busy={refreshing} onPress={refresh} />}
          <Button label="Read community rules" icon="shield-checkmark-outline" variant="primary" onPress={() => router.push('/rules')} />
        </View>
      </View>
    );
  }

  if (rules === 'unknown') {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Feed" />
        <Segments value={segment} onChange={setSegment} />
        {invite}
        <FeedSkeleton />
      </View>
    );
  }

  // Nothing to show and the server failed (not a signal problem): the shared error pattern (empty-states 06).
  if (error && !offline && posts.length === 0) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Feed" />
        <Segments value={segment} onChange={setSegment} />
        <View style={styles.gate}>
          <ErrorState title="Couldn’t load the feed." reassurance="The server didn’t answer. Your hunts and plans are safe on this phone." onRetry={refresh} testID="feed-error" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Feed" />
      <Segments value={segment} onChange={setSegment} />
      {invite}
      {offline && (
        <OfflineBanner testID="feed-offline" style={{ marginHorizontal: space.lg, marginBottom: space.md }}>
          {savedAt && posts.length ? `showing posts saved at ${savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. New posts load when you’re back in range.` : 'New posts load when you’re back in range.'}
        </OfflineBanner>
      )}
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
            <Pressable accessibilityRole="link" onPress={() => router.push('/rules')}>
              <Text style={styles.rulesLink}>Community rules</Text>
            </Pressable>
            {notice && <Notice tone="success">{notice}</Notice>}
            {error && !offline && <Notice tone="error">{error}</Notice>}
          </View>
        }
        ListEmptyComponent={
          refreshing ? undefined : <Text style={ui.muted}>No posts yet. Log a hunt and it’ll show here tomorrow (12h+ delay).</Text>
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
  crewList: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  root: { flex: 1, backgroundColor: colors.ground },
  gate: { padding: space.lg, gap: space.md },
  rulesLink: { color: colors.accent, textDecorationLine: 'underline' },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  inviteCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.lg, marginBottom: space.md, paddingLeft: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dismiss: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.md, padding: 3, borderRadius: radius.md, backgroundColor: colors.surface },
  segment: { flex: 1, minHeight: touchTarget - 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.surfaceRaised },
  segmentText: { fontFamily: fonts.bodySemi, color: colors.muted },
  segmentTextActive: { color: colors.text },
  empty: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.xl },
  illustration: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 24, color: colors.text },
  link: { color: colors.accent, fontFamily: fonts.bodySemi, minHeight: touchTarget, textAlignVertical: 'center' },
  cardTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  communityCard: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: space.lg },
});
