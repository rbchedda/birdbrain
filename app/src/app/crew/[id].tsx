import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { Tag } from '@/components/Tag';
import { Button, Notice, SectionTitle, ui } from '@/components/ui';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import type { CrewMember } from '@/data/types';
import { colors, fonts, space } from '@/theme/tokens';

const memberName = (m: CrewMember) => m.author.displayName ?? (m.author.username ? `@${m.author.username}` : 'Hunter');

/** Crew home: members, invite (admins), leave. Pins and the shared log come later. */
export default function CrewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const crew = useAsync(() => (session && id ? backend.crew(id) : Promise.resolve(null)), [session, id]);
  const [error, setError] = useState<string>();
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    setLeaving(true);
    try {
      await backend.leaveCrew(id);
      router.replace('/feed');
    } catch (e) {
      setError((e as Error).message);
      setLeaving(false);
    }
  };
  const confirmLeave = () => {
    const lastAdmin = crew.data?.role === 'admin' && crew.data.members.filter((m) => m.role === 'admin').length === 1;
    const msg = leaveWarning(lastAdmin, crew.data?.memberCount ?? 1);
    if (Platform.OS === 'web') return void leave();
    Alert.alert('Leave crew?', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void leave() },
    ]);
  };

  if (session === null)
    return (
      <View style={styles.root}>
        <ScreenHeader title="Crew" back />
        <SignInPrompt why="Sign in to see your crews." />
      </View>
    );

  const c = crew.data;
  return (
    <View style={styles.root}>
      <ScreenHeader title={c?.name ?? 'Crew'} subtitle={c ? `${c.memberCount} ${c.memberCount === 1 ? 'member' : 'members'} · private` : undefined} back />
      <ScrollView contentContainerStyle={styles.body}>
        {crew.error && <Notice tone="error">{crew.error.message}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {!crew.loading && !crew.error && !c && <Notice>This crew doesn’t exist, or you’re not a member.</Notice>}
        {c && (
          <>
            {c.role === 'admin' && (
              <Button
                label="Invite people"
                icon="qr-code-outline"
                variant="primary"
                onPress={() => router.push({ pathname: '/crew/invite', params: { id: c.id } })}
              />
            )}
            <SectionTitle>Members</SectionTitle>
            <View testID="crew-members" style={{ gap: space.sm }}>
              {c.members.map((m) => (
                <View key={m.author.id} style={[ui.card, ui.row]}>
                  <Text style={styles.name}>{memberName(m)}</Text>
                  {m.role === 'admin' && <Tag label="Admin" tone="accent" />}
                </View>
              ))}
            </View>
            <Text style={ui.muted}>Crew pins and a shared log are coming soon. Hunt logs stay private unless you post them.</Text>
            <Button label="Leave crew" icon="exit-outline" busy={leaving} onPress={confirmLeave} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Mirrors public.leave_crew: last admin out promotes the longest-standing member; last member out deletes the crew. */
export function leaveWarning(lastAdmin: boolean, memberCount: number): string {
  if (memberCount <= 1) return 'You’re the last member, so leaving deletes this crew and its invites.';
  if (lastAdmin) return 'You’re the only admin. If you leave, the longest-standing member becomes admin. You’ll need a new invite to rejoin.';
  return 'You’ll need a new invite to rejoin.';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  name: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text, flex: 1 },
});
