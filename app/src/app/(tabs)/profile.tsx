import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { LegalLinks } from '@/components/LegalLinks';
import { PostCard } from '@/components/PostCard';
import { ScreenHeader } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { Button, Chip, Notice, SectionTitle, ui } from '@/components/ui';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { journalEntries, removeJournalEntry } from '@/data/journal';
import { displayName } from '@/data/types';
import { colors, space } from '@/theme/tokens';

export default function ProfileScreen() {
  const session = useSession();
  const me = session?.userId;
  const profile = useAsync(() => (me ? backend.profile(me) : Promise.resolve(null)), [me]);
  const shared = useAsync(() => (me ? backend.postsBy(me) : Promise.resolve([])), [me]);
  const journal = useAsync(journalEntries, []);
  const blocked = useAsync(() => (me ? backend.blockedUsers() : Promise.resolve([])), [me]);

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [hasDog, setHasDog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string }>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await backend.deleteAccount();
      router.replace('/');
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!profile.data) return;
    setUsername(profile.data.username ?? '');
    setName(profile.data.displayName ?? '');
    setHasDog(profile.data.hasDog);
  }, [profile.data]);

  const save = async () => {
    setSaving(true);
    try {
      await backend.updateProfile({ username: username.trim().toLowerCase() || null, displayName: name.trim() || null, hasDog });
      setMessage({ tone: 'success', text: 'Profile saved.' });
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const posts = [...(journal.data ?? []), ...(shared.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={profile.data ? displayName(profile.data) : 'Profile'}
        subtitle={backend.mode === 'sample' ? 'Sample mode: nothing leaves this device.' : session?.email ?? (session?.anonymous ? 'Guest account' : undefined)}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Button label="Log a hunt" icon="add" variant="primary" onPress={() => router.push('/log')} />
        {session === null ? (
          <SignInPrompt why="Sign in to set up your profile. Your private log below stays on this device either way." />
        ) : (
          <>
            <SectionTitle>About you</SectionTitle>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Display name"
              placeholderTextColor={colors.muted}
              maxLength={60}
              style={ui.input}
              accessibilityLabel="Display name"
            />
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              style={ui.input}
              accessibilityLabel="Username"
            />
            <View style={ui.row}>
              <Chip label="I hunt with a dog" icon="paw-outline" active={hasDog} onPress={() => setHasDog((v) => !v)} />
            </View>
            {message && <Notice tone={message.tone}>{message.text}</Notice>}
            <Button label="Save profile" variant="primary" busy={saving} onPress={save} />
          </>
        )}

        <SectionTitle>My hunts</SectionTitle>
        {posts.length === 0 && <Text style={ui.muted}>Nothing logged yet.</Text>}
        {posts.map((p) => (
          <View key={p.id} style={{ gap: space.sm }}>
            <PostCard post={p} onDeleted={() => shared.reload()} />
            {!p.publicAfter && (
              <Button
                label="Delete private entry"
                icon="trash-outline"
                variant="danger"
                onPress={async () => {
                  await removeJournalEntry(p.id);
                  journal.reload();
                }}
              />
            )}
          </View>
        ))}

        {session && (
          <>
            <SectionTitle>Blocked</SectionTitle>
            {blocked.data?.length === 0 && <Text style={ui.muted}>You haven’t blocked anyone.</Text>}
            {blocked.data?.map((a) => (
              <View key={a.id} style={ui.row}>
                <Text style={[ui.body, { flex: 1 }]}>{displayName(a)}</Text>
                <Button
                  label="Unblock"
                  onPress={async () => {
                    await backend.setBlocked(a.id, false);
                    blocked.reload();
                  }}
                />
              </View>
            ))}
          </>
        )}

        {backend.mode === 'supabase' && session && (
          <Button
            label="Sign out"
            icon="log-out-outline"
            onPress={async () => {
              await backend.signOut();
              router.replace('/');
            }}
            style={{ marginTop: space.xl }}
          />
        )}

        {session && (
          <>
            <SectionTitle>Delete account</SectionTitle>
            {!confirmDelete ? (
              <Button label="Delete account" icon="trash-outline" variant="danger" onPress={() => setConfirmDelete(true)} />
            ) : (
              <>
                <Notice tone="error">
                  This permanently deletes your account, posts, comments, photos, locations, group memberships, blocks and
                  reports. It can’t be undone.
                </Notice>
                {deleteError && <Notice tone="error">{deleteError}</Notice>}
                <Button label="Yes, delete my account" variant="danger" busy={deleting} onPress={deleteAccount} />
                <Button label="Cancel" onPress={() => setConfirmDelete(false)} />
              </>
            )}
          </>
        )}

        <LegalLinks />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
});
