import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { AccountSettings, SectionRow, StatTiles, badgesSummary, dogsSummary, lifeSummary, useProfileData } from '@/components/profile';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { seasonLabel } from '@/data/stats';
import { displayName } from '@/data/types';
import { colors, fonts, space } from '@/theme/tokens';

/** Profile hub (wireframe 06): header stats, then one row per section. */
export default function ProfileScreen() {
  const session = useSession();
  const me = session?.userId;
  const profile = useAsync(() => (me ? backend.profile(me) : Promise.resolve(null)), [me]);
  const p = useProfileData();
  const species = p.life.filter((i) => i.kind === 'species').length;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={profile.data ? displayName(profile.data) : 'Profile'}
        subtitle={`${seasonLabel(p.season)} season${backend.mode === 'sample' ? ' · sample mode' : ''}`}
        back
      />
      <ScrollView contentContainerStyle={styles.body}>
        {session === null && <SignInPrompt why="Sign in to back up your private hunt log to your account. It works on this device either way." />}
        <StatTiles
          testID="profile-stats"
          tiles={[
            { label: 'days afield', value: p.stats.daysAfield },
            { label: 'flushes', value: p.stats.flushes },
            { label: 'game lands', value: p.stats.gameLands },
            { label: 'life list', value: species },
          ]}
        />
        <SectionRow title="Trophies & badges" summary={badgesSummary(p.badges)} href="/profile/trophies" />
        <SectionRow title="Hunt log (diary)" summary={`${p.entries.length} private ${p.entries.length === 1 ? 'entry' : 'entries'} · season view`} href="/profile/hunt-log" />
        <SectionRow title="Season stats" summary="flushes, shots, points by month" href="/profile/stats" />
        <SectionRow title="Life list" summary={lifeSummary(p.life)} href="/profile/life-list" />
        <SectionRow title="Dogs" summary={dogsSummary(p.dogs)} href="/profile/dogs" />
        <SectionRow title="Settings" summary="profile · privacy · blocked" href="/profile/settings" tone="muted" />
        <AccountSettings />
        <Text style={styles.note}>Entries are private by default, saved on this device first and backed up to your account.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: space.md },
});
