import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SignInPrompt } from '@/components/SignInPrompt';
import { Button } from '@/components/ui';
import { HuntLogList, SectionRow, StatTiles, badgesSummary, dogsSummary, lifeSummary, useProfileData } from '@/components/profile';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { seasonLabel } from '@/data/stats';
import { displayName, initials, type Profile } from '@/data/types';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Profile (redesign mockup 05): compact header with ⚙, three stats, the Hunt
 * diary as main content, then Trophies, Life list and Dogs. Season stats,
 * account, sign out, delete account and legal live in Settings (⚙).
 */
/** "Lancaster County" only when the user set it explicitly; otherwise null (row hidden). No zone, no location inference. */
export function homeCountyLabel(p: Pick<Profile, 'homeCounty'> | null | undefined): string | null {
  const c = p?.homeCounty?.trim();
  if (!c) return null;
  return /county$/i.test(c) ? c : `${c} County`;
}

export default function ProfileScreen() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const me = session?.userId;
  const profile = useAsync(() => (me ? backend.profile(me) : Promise.resolve(null)), [me]);
  const p = useProfileData();
  const signedOut = backend.mode === 'supabase' && !session;
  const name = profile.data ? displayName(profile.data) : 'Profile';
  const county = homeCountyLabel(profile.data);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.data ? initials(profile.data) : '·'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} accessibilityRole="header" numberOfLines={1}>
            {name}
          </Text>
          {county && (
            <Text style={styles.sub} testID="home-county">
              {county}
            </Text>
          )}
          <Text style={styles.sub}>
            {seasonLabel(p.season)} season{backend.mode === 'sample' ? ' · sample mode' : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/profile/settings')} style={styles.gear}>
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {session === null && <SignInPrompt why="Save your hunts so they’re never lost if you switch phones. Sign in to keep your private Hunt Log backed up to your account." />}
        <Pressable accessibilityRole="button" accessibilityHint="Opens season stats" onPress={() => router.push('/profile/stats')}>
          <StatTiles
            testID="profile-stats"
            tiles={[
              { label: 'days afield', value: p.stats.daysAfield },
              { label: 'flushes', value: p.stats.flushes },
              { label: 'game lands', value: p.stats.gameLands },
            ]}
          />
        </Pressable>

        <View style={styles.sectionHead}>
          <Text style={styles.section}>Hunt diary</Text>
          {p.entries.length > 0 && (
            <Pressable accessibilityRole="link" onPress={() => router.push('/profile/hunt-log')} style={styles.seeAll}>
              <Text style={styles.link}>See all {p.entries.length} ›</Text>
            </Pressable>
          )}
        </View>
        <HuntLogList entries={p.entries} signedOut={signedOut} limit={2} />
        {p.entries.length === 0 && <Button label="Log a hunt" icon="add" variant="primary" onPress={() => router.push('/new/log')} />}

        <View style={{ gap: space.sm, marginTop: space.md }}>
          <SectionRow title="🏅 Trophies & badges" summary={badgesSummary(p.badges)} href="/profile/trophies" />
          <SectionRow title="❦ Life list" summary={lifeSummary(p.life)} href="/profile/life-list" />
          <SectionRow title="🐕 Dogs" summary={dogsSummary(p.dogs)} href="/profile/dogs" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text },
  name: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  gear: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginRight: -space.sm },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  section: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text },
  seeAll: { minHeight: touchTarget, justifyContent: 'center', borderRadius: radius.sm },
  link: { color: colors.accent, fontFamily: fonts.bodySemi },
});
