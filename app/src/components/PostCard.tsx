import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Tag } from '@/components/Tag';
import { speciesLabel, type Post } from '@/data/types';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

export function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <View style={styles.card} testID={`post-${post.id}`}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.avatarInitials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.author}>{post.author}</Text>
          <Text style={styles.meta}>
            {post.area} · {post.postedAgo}
            {post.group ? ` · ${post.group}` : ''}
          </Text>
        </View>
        <Tag label={speciesLabel[post.species]} tone={post.species === 'dove' ? 'dove' : 'neutral'} />
      </View>

      <View style={[styles.photo, { backgroundColor: post.photoTint }]} accessibilityLabel="Harvest photo">
        <Ionicons name="image-outline" size={36} color="rgba(242,244,239,0.5)" />
        <View style={styles.blurBadge}>
          <Ionicons name="eye-off-outline" size={12} color={colors.text} />
          <Text style={styles.blurText}>Location blurred</Text>
        </View>
      </View>

      <Text style={styles.caption}>{post.caption}</Text>

      <View style={styles.actions}>
        <Action
          icon={liked ? 'heart' : 'heart-outline'}
          label={String(post.likes + (liked ? 1 : 0))}
          active={liked}
          a11y={liked ? 'Unlike' : 'Like'}
          onPress={() => setLiked((v) => !v)}
        />
        <Action icon="chatbubble-outline" label={String(post.comments)} a11y="Comments" />
        <View style={{ flex: 1 }} />
        <Action
          icon={saved ? 'bookmark' : 'bookmark-outline'}
          active={saved}
          a11y={saved ? 'Unsave' : 'Save'}
          onPress={() => setSaved((v) => !v)}
        />
      </View>
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
  caption: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 21, padding: space.md },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, paddingBottom: space.xs },
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
