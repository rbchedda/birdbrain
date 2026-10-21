import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CommunityOptIn } from '@/components/CommunityOptIn';
import { ScreenHeader } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { Tag } from '@/components/Tag';
import { Button, Chip, Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { useShareToCommunity } from '@/lib/shareToCommunity';
import { colors, fonts, space } from '@/theme/tokens';

type Segment = 'groups' | 'community';

export default function GroupsScreen() {
  const params = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<Segment>(params.segment === 'community' ? 'community' : 'groups');
  const sharing = useShareToCommunity();

  return (
    <View style={styles.root}>
      <ScreenHeader title="Crew" subtitle="Your groups, and the opt-in community feed" />
      <View style={[ui.row, styles.segments]}>
        <Chip label="Groups" icon="people-outline" active={segment === 'groups'} onPress={() => setSegment('groups')} />
        <Chip label="Community" icon="newspaper-outline" active={segment === 'community'} onPress={() => setSegment('community')} />
      </View>
      {segment === 'groups' ? (
        <Groups />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {sharing ? (
            <>
              <Text style={ui.muted}>Delayed, blurred posts from hunters who opted in.</Text>
              <Button label="Open community feed" variant="primary" icon="newspaper-outline" onPress={() => router.push('/feed')} />
            </>
          ) : null}
          <CommunityOptIn />
        </ScrollView>
      )}
    </View>
  );
}

function Groups() {
  const session = useSession();
  const groups = useAsync(() => (session ? backend.groups() : Promise.resolve([])), [session]);
  const [error, setError] = useState<string>();

  if (session === null) return <SignInPrompt why="Sign in to join species groups and post to them." />;
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {groups.error && <Notice tone="error">{groups.error.message}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  segments: { paddingHorizontal: space.lg, paddingBottom: space.md },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  name: { fontFamily: fonts.headingSemi, fontSize: 22, color: colors.text, flex: 1 },
});
