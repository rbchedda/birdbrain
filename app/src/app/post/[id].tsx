import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { countsText, PostCard } from '@/components/PostCard';
import { ScreenHeader } from '@/components/Screen';
import { ActionMenu, ReportSheet } from '@/components/Sheets';
import { SignInPrompt } from '@/components/SignInPrompt';
import { Button, Notice, SectionTitle, ui } from '@/components/ui';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { displayName, type Comment, type ReportTarget } from '@/data/types';
import { ago } from '@/lib/time';
import { colors, fonts, space, touchTarget } from '@/theme/tokens';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const post = useAsync(() => (session ? backend.post(id) : Promise.resolve(null)), [id, session]);
  const comments = useAsync(() => (session ? backend.comments(id) : Promise.resolve([])), [id, session]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [menuFor, setMenuFor] = useState<Comment | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);

  const send = async () => {
    setBusy(true);
    try {
      await backend.addComment(id, body.trim());
      setBody('');
      setError(undefined);
      comments.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (session === null) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Post" back />
        <SignInPrompt why="Sign in to see posts and comments." />
      </View>
    );
  }

  const p = post.data;
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Post" back />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {post.error && <Notice tone="error">{post.error.message}</Notice>}
        {!post.loading && !p && !post.error && (
          <Notice>This post isn’t available. It may be deleted, not public yet, or from someone you’ve blocked.</Notice>
        )}
        {p && (
          <PostCard
            post={p}
            detail
            onBlocked={() => router.back()}
            onDeleted={() => router.back()}
          />
        )}
        {p?.mine && !!p.placeCounts?.length && (
          <View style={ui.card}>
            <View style={ui.row}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.dove} />
              <Text style={styles.label}>Your places (only you can see this)</Text>
            </View>
            {p.placeCounts.map((c, i) => (
              <Text key={i} style={ui.body}>
                {c.placeName}: {countsText(c)}
              </Text>
            ))}
          </View>
        )}

        {p && (
          <>
            <SectionTitle>Comments</SectionTitle>
            {comments.data?.length === 0 && <Text style={ui.muted}>No comments yet.</Text>}
            {comments.data?.map((c) => (
              <View key={c.id} style={styles.comment} testID={`comment-${c.id}`}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.label}>
                    {displayName(c.author)} <Text style={ui.muted}>· {ago(c.createdAt)}</Text>
                  </Text>
                  <Text style={ui.body}>{c.body}</Text>
                </View>
                {!c.mine && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Comment options"
                    onPress={() => setMenuFor(c)}
                    style={styles.more}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                  </Pressable>
                )}
              </View>
            ))}
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Add a comment"
              placeholderTextColor={colors.muted}
              maxLength={1000}
              multiline
              style={ui.input}
              accessibilityLabel="Add a comment"
            />
            {error && <Notice tone="error">{error}</Notice>}
            <Button label="Comment" icon="chatbubble-outline" variant="primary" disabled={!body.trim()} busy={busy} onPress={send} />
          </>
        )}
      </ScrollView>

      <ActionMenu
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                { label: 'Report comment', icon: 'flag-outline', onPress: () => setReport({ kind: 'comment', id: menuFor.id }) },
                {
                  label: `Block ${displayName(menuFor.author)}`,
                  icon: 'remove-circle-outline',
                  danger: true,
                  onPress: async () => {
                    await backend.setBlocked(menuFor.author.id, true).catch((e: Error) => setError(e.message));
                    comments.reload();
                  },
                },
              ]
            : []
        }
      />
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  comment: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  more: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
