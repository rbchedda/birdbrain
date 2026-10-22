import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { QrCode } from '@/components/QrCode';
import { ScreenHeader } from '@/components/Screen';
import { CrewSignInSheet } from '@/components/CrewSignInSheet';
import { Button, Notice, SectionTitle, ui } from '@/components/ui';
import { backend } from '@/data';
import { inviteUrl, parseInviteToken } from '@/data/crew';
import { useSession } from '@/data/hooks';
import type { CrewInvite } from '@/data/types';
import { needsAccount } from '@/lib/gate';
import { colors, space } from '@/theme/tokens';

const PRIVACY = 'Crews are private: no public directory, joined only by invite link or QR. Crew posts show 12+ hours after the hunt, with no live locations.';

/**
 * /crew/invite             start a crew, or join one with a pasted link/code
 * /crew/invite?id=<crew>   (admin) show a new invite link and QR code
 * /crew/invite?token=<t>   opened from an invite link or QR: join
 */
export default function CrewInviteScreen() {
  const session = useSession();
  const { id, token } = useLocalSearchParams<{ id?: string; token?: string }>();
  const title = id ? 'Invite to crew' : token ? 'Crew invite' : 'Crews';

  return (
    <View style={styles.root}>
      <ScreenHeader title={title} back />
      {session === undefined ? null : needsAccount('crews', session) ? (
        <CrewSignInSheet />
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {id ? <ShareInvite crewId={id} /> : <StartOrJoin initialToken={token} />}
          <Text style={ui.muted}>{PRIVACY}</Text>
        </ScrollView>
      )}
    </View>
  );
}

function ShareInvite({ crewId }: { crewId: string }) {
  const [invite, setInvite] = useState<CrewInvite | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true);
    try {
      setInvite(await backend.createCrewInvite(crewId));
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void make();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewId]);

  const url = invite ? inviteUrl(invite.token) : null;
  return (
    <View style={{ gap: space.md }}>
      {error && <Notice tone="error">{error}</Notice>}
      {invite && url && (
        <View style={[ui.card, styles.center]} testID="crew-invite">
          <QrCode value={url} testID="crew-invite-qr" />
          <Text style={ui.muted}>Expires {new Date(invite.expiresAt).toLocaleDateString()}</Text>
          <Button
            label="Share invite link"
            icon="share-outline"
            variant="primary"
            style={{ alignSelf: 'stretch' }}
            onPress={() => Share.share({ message: `Join my hunting crew on BirdBrain: ${url}` }).catch(() => {})}
          />
          <Button label="New link" icon="refresh-outline" busy={busy} style={{ alignSelf: 'stretch' }} onPress={make} />
        </View>
      )}
    </View>
  );
}

function StartOrJoin({ initialToken }: { initialToken?: string }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialToken ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const create = async () => {
    const n = name.trim();
    if (n.length < 1 || n.length > 40) return setError('Crew names are 1 to 40 characters.');
    setBusy('create');
    try {
      const id = await backend.createCrew(n);
      router.replace({ pathname: '/crew/[id]', params: { id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    const t = parseInviteToken(code);
    if (!t) return setError('That doesn’t look like a crew invite link.');
    setBusy('join');
    try {
      const id = await backend.joinCrew(t);
      router.replace({ pathname: '/crew/[id]', params: { id } });
    } catch (e) {
      setError(/invalid|expired/i.test((e as Error).message) ? 'That invite is invalid or has expired. Ask your crew for a new link.' : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      {error && <Notice tone="error">{error}</Notice>}
      {initialToken ? (
        <View style={ui.card}>
          <Text style={ui.body}>You’ve been invited to a private crew.</Text>
          <Button label="Join crew" icon="people-outline" variant="primary" busy={busy === 'join'} onPress={join} />
        </View>
      ) : (
        <>
          <SectionTitle>Start a crew</SectionTitle>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Crew name (e.g. Tuesday Dogs)"
            placeholderTextColor={colors.muted}
            maxLength={40}
            style={ui.input}
            accessibilityLabel="Crew name"
          />
          <Button label="Start crew" icon="add-outline" variant="primary" busy={busy === 'create'} onPress={create} />
          <SectionTitle>Have an invite?</SectionTitle>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Paste invite link"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={ui.input}
            accessibilityLabel="Invite link"
          />
          <Button label="Join crew" icon="people-outline" busy={busy === 'join'} onPress={join} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  center: { alignItems: 'center', gap: space.md },
});
