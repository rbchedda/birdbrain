import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionMenu, ReportSheet, type MenuAction } from '@/components/Sheets';
import { Tag } from '@/components/Tag';
import { backend } from '@/data';
import { usePlaces } from '@/data/hooks';
import { displayName, initials, speciesLabel, type BirdCounts, type Post, type ReportTarget } from '@/data/types';
import { postVisibility, visibilityText } from '@/data/visibility';
import { areaLabel } from '@/lib/geo';
import { ago } from '@/lib/time';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

export function countsText(c: BirdCounts) {
  return `Flushed ${c.flushed} · Roosters ${c.roosters} · Bagged ${c.harvested}`;
}

/** Redesign: the feed's delay meaning lives on each card, e.g. "shared 14 h after hunt". */
export function delayLabel(post: Pick<Post, 'mine' | 'createdAt' | 'publicAfter'>): string | null {
  if (post.mine || !post.publicAfter) return null;
  const h = Math.round((new Date(post.publicAfter).getTime() - new Date(post.createdAt).getTime()) / 3600_000);
  return h > 0 ? `shared ${h} h after hunt` : null;
}

export function PostCard({
  post,
  detail,
  onBlocked,
  onDeleted,
}: {
  post: Post;
  /** Already on the post's own screen: don't link to it. */
  detail?: boolean;
  onBlocked?: (authorId: string) => void;
  onDeleted?: (postId: string) => void;
}) {
  const { places } = usePlaces();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likes);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [error, setError] = useState<string>();
  const visibility = postVisibility(post);
  const name = displayName(post.author);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      await backend.setLiked(post.id, next);
      setError(undefined);
    } catch (e) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      setError((e as Error).message);
    }
  };

  const actions: MenuAction[] = post.mine
    ? [
        {
          label: 'Delete post',
          icon: 'trash-outline',
          danger: true,
          onPress: async () => {
            try {
              await backend.deletePost(post.id);
              onDeleted?.(post.id);
            } catch (e) {
              setError((e as Error).message);
            }
          },
        },
      ]
    : [
        { label: 'Report post', icon: 'flag-outline', onPress: () => setReport({ kind: 'post', id: post.id }) },
        {
          label: `Block ${name}`,
          icon: 'remove-circle-outline',
          danger: true,
          onPress: async () => {
            try {
              await backend.setBlocked(post.author.id, true);
              onBlocked?.(post.author.id);
            } catch (e) {
              setError((e as Error).message);
            }
          },
        },
      ];

  const openAuthor = () => router.push(post.mine ? '/profile' : { pathname: '/user/[id]', params: { id: post.author.id } });
  const openPost = () => !detail && visibility !== 'private' && router.push({ pathname: '/post/[id]', params: { id: post.id } });

  return (
    <View style={styles.card} testID={`post-${post.id}`}>
      <View style={styles.header}>
        <Pressable accessibilityRole="link" accessibilityLabel={`${name}'s profile`} onPress={openAuthor} style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(post.author)}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.author}>{name}</Text>
          <Text style={styles.meta}>
            {post.location === 'blurred' ? areaLabel(post.area, places) : 'Location hidden'} · {ago(post.createdAt)}
            {post.group ? ` · ${post.group}` : ''}
            {delayLabel(post) ? ` · ${delayLabel(post)}` : ''}
          </Text>
        </View>
        {post.species && <Tag label={speciesLabel[post.species]} tone={post.species === 'dove' ? 'dove' : 'neutral'} />}
        {visibility !== 'private' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Post options" onPress={() => setMenu(true)} style={styles.more}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {post.photoTint && (
        <View style={[styles.photo, { backgroundColor: post.photoTint }]} accessibilityLabel="Harvest photo">
          <Ionicons name="image-outline" size={36} color="rgba(242,244,239,0.5)" />
          <View style={styles.blurBadge}>
            <Ionicons name="eye-off-outline" size={12} color={colors.text} />
            <Text style={styles.blurText}>Location blurred</Text>
          </View>
        </View>
      )}

      {post.mine && (
        <View style={styles.visibility} testID="visibility">
          <Ionicons
            name={visibility === 'private' ? 'lock-closed-outline' : visibility === 'delayed' ? 'time-outline' : 'globe-outline'}
            size={14}
            color={visibility === 'public' ? colors.success : colors.dove}
          />
          <Text style={styles.visibilityText}>{visibilityText(post)}</Text>
        </View>
      )}

      {!!post.caption && <Text style={styles.caption}>{post.caption}</Text>}
      {post.counts && <Text style={styles.counts}>{countsText(post.counts)}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {visibility !== 'private' && (
        <View style={styles.actions}>
          <Action
            icon={liked ? 'heart' : 'heart-outline'}
            label={String(likes)}
            active={liked}
            a11y={liked ? 'Unlike' : 'Like'}
            onPress={toggleLike}
          />
          <Action icon="chatbubble-outline" label={String(post.comments)} a11y="Comments" onPress={openPost} />
        </View>
      )}

      <ActionMenu visible={menu} actions={actions} onClose={() => setMenu(false)} />
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </View>
  );
}

function Action({
  icon,
  label,
  active,
  a11y,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  active?: boolean;
  a11y: string;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={styles.action}>
      <Ionicons name={icon} size={22} color={active ? colors.accent : colors.text} />
      {label !== undefined && <Text style={styles.actionText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bodySemi, color: colors.text, fontSize: 14 },
  author: { fontFamily: fonts.bodySemi, color: colors.text, fontSize: 15 },
  meta: { fontFamily: fonts.body, color: colors.muted, fontSize: 13 },
  more: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginRight: -space.sm },
  photo: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center' },
  blurBadge: {
    position: 'absolute',
    left: space.md,
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,26,19,0.8)',
  },
  blurText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
  visibility: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingTop: space.md },
  visibilityText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  caption: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 21, paddingHorizontal: space.md, paddingTop: space.md },
  counts: { fontFamily: fonts.bodyMedium, color: colors.muted, fontSize: 13, paddingHorizontal: space.md, paddingTop: space.sm },
  error: { fontFamily: fonts.body, color: colors.danger, fontSize: 13, paddingHorizontal: space.md, paddingTop: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, paddingVertical: space.xs },
  action: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
  },
  actionText: { fontFamily: fonts.bodyMedium, color: colors.text, fontSize: 14 },
});
