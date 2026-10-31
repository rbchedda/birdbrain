import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { EmptyState } from '@/components/States';
import { router } from 'expo-router';
import { Tag } from '@/components/Tag';
import { Button, Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { colors, fonts, space } from '@/theme/tokens';

export default function GroupsScreen() {
  const session = useSession();
  const groups = useAsync(() => (session ? backend.groups() : Promise.resolve([])), [session]);
  const [error, setError] = useState<string>();

  return (
    <View style={styles.root}>
      <ScreenHeader title="Crew" subtitle="Species groups across Pennsylvania" back />
      {session === null ? (
        <SignInPrompt why="Sign in to join species groups and post to them." />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {groups.error && <Notice tone="error">{groups.error.message}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          {groups.data && groups.data.length === 0 && !groups.error && (
            <EmptyState
              testID="groups-empty"
              icon="people-outline"
              title="No crews yet"
              body="Start a private crew and invite the people you hunt with by link or QR code."
              action={{ label: 'Create a crew', onPress: () => router.push('/crew/invite') }}
            />
          )}
          {groups.data?.map((g) => (
            <View key={g.id} style={ui.card} testID={`group-${g.slug}`}>
              <View style={ui.row}>
                <Text style={styles.name}>{g.name}</Text>
                {g.member && <Tag label="Member" tone="accent" />}
              </View>
              {g.description && <Text style={ui.muted}>{g.description}</Text>}
              <Button
                label={g.member ? 'Leave' : 'Join'}
                variant={g.member ? 'secondary' : 'primary'}
                onPress={async () => {
                  try {
                    await backend.setMember(g.id, !g.member);
                    setError(undefined);
                    groups.reload();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  name: { fontFamily: fonts.headingSemi, fontSize: 22, color: colors.text, flex: 1 },
});
