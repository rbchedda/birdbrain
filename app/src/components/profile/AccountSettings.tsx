import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { LegalLinks } from '@/components/LegalLinks';
import { Button, Chip, Notice, SectionTitle, ui } from '@/components/ui';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { displayName } from '@/data/types';
import { offlinePacks } from '@/offline';
import { colors, space } from '@/theme/tokens';

/** Settings: display name, username, dog flag, blocked users. */
/**
 * Downloaded map packs belong to the signed-in user (a paid feature), so they and their
 * stored index go on sign-out and account deletion. The free safety cache (public game
 * land list and outlines) is kept: it is public data and helps whoever uses the device next.
 */
async function clearOfflinePacks() {
  try {
    await offlinePacks.clear();
  } catch {
    // Never block signing out on storage cleanup.
  }
}

export function ProfileSettings() {
  const session = useSession();
  const me = session?.userId;
  const profile = useAsync(() => (me ? backend.profile(me) : Promise.resolve(null)), [me]);
  const blocked = useAsync(() => (me ? backend.blockedUsers() : Promise.resolve([])), [me]);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [hasDog, setHasDog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string }>();

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

  if (!session) return <Text style={ui.muted}>Sign in to edit your profile. Your private hunt log works without an account.</Text>;
  return (
    <View style={{ gap: space.sm }}>
      <SectionTitle>About you</SectionTitle>
      <TextInput value={name} onChangeText={setName} placeholder="Display name" placeholderTextColor={colors.muted} maxLength={60} style={ui.input} accessibilityLabel="Display name" />
      <TextInput value={username} onChangeText={setUsername} placeholder="username" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} maxLength={24} style={ui.input} accessibilityLabel="Username" />
      <View style={ui.row}>
        <Chip label="I hunt with a dog" icon="paw-outline" active={hasDog} onPress={() => setHasDog((v) => !v)} />
      </View>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Button label="Save profile" variant="primary" busy={saving} onPress={save} />

      <SectionTitle>Privacy</SectionTitle>
      <Text style={ui.muted}>Hunt log entries are private by default. They save on this device first and back up to your account, where only you can see them.</Text>

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
    </View>
  );
}

/** Account (sign out, dev-1's confirmable Delete account) and Legal links. */
export function AccountSettings() {
  const session = useSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await backend.deleteAccount();
      await clearOfflinePacks();
      router.replace('/');
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={{ gap: space.sm }} testID="account-settings">
      {session && <SectionTitle>Account</SectionTitle>}
      {backend.mode === 'supabase' && session && (
        <Button
          label="Sign out"
          icon="log-out-outline"
          onPress={async () => {
            await backend.signOut();
            await clearOfflinePacks();
            router.replace('/');
          }}
        />
      )}
      {session &&
        (!confirmDelete ? (
          <Button label="Delete account" icon="trash-outline" variant="danger" onPress={() => setConfirmDelete(true)} />
        ) : (
          <>
            <Notice tone="error">
              This permanently deletes your account, posts, comments, photos, locations, hunt log backups, group memberships,
              blocks and reports. It can’t be undone.
            </Notice>
            {deleteError && <Notice tone="error">{deleteError}</Notice>}
            <Button label="Yes, delete my account" variant="danger" busy={deleting} onPress={deleteAccount} />
            <Button label="Cancel" onPress={() => setConfirmDelete(false)} />
          </>
        ))}
      <SectionTitle>Legal</SectionTitle>
      <Button label="Community rules" icon="document-text-outline" onPress={() => router.push('/rules')} />
      <Button label="Data sources" icon="layers-outline" onPress={() => router.push('/data-sources')} />
      <LegalLinks credits />
    </View>
  );
}
