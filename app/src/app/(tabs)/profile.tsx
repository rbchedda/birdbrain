import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProfileStatsSection } from '@/components/stats/ProfileStatsSection';
import { SignInPrompt } from '@/components/SignInPrompt';
import { UsernameForm } from '@/components/UsernameForm';
import { MenuRow, badgesSummary, dogsSummary, lifeSummary, useProfileData } from '@/components/profile';
import { backend } from '@/data';
import { refreshPlans, startPlansSyncOnce, useAsync, useSession } from '@/data/hooks';
import { seasonLabel } from '@/data/stats';
import { displayName, initials, type Profile } from '@/data/types';
import { splitPlans, usePlans } from '@/lib/plans';
import { colors, fonts, space, touchTarget } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Profile: compact header with ⚙, then a menu (Hunt log, Stats, Dogs, Plans).
 * Each row pushes its own full-screen page with a back arrow; there is no tab
 * row or swipe pager. Below the menu: this season's Stats preview, then
 * Trophies and Life list. Account, sign out, delete account and legal live in
 * Settings (⚙).
 */
export const huntSummary = (n: number) => (n === 0 ? 'No hunts yet. Tap ＋ to log your first' : `${n} ${n === 1 ? 'hunt' : 'hunts'} in your private diary`);

export function plansSummary(plans: ReturnType<typeof usePlans>, signedIn: boolean): string {
  if (!signedIn) return 'Sign in to plan hunts';
  if (!plans) return 'Your planned hunts';
  const { upcoming } = splitPlans(plans);
  return upcoming.length ? `${upcoming.length} upcoming` : 'No hunts planned';
}

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
  const plans = usePlans(me);
  const name = profile.data ? displayName(profile.data) : 'Profile';
  const county = homeCountyLabel(profile.data);
  const [editingUsername, setEditingUsername] = useState(false);
  // Fresh plan count whenever Profile comes back into view (same sync Plans used to start here).
  useFocusEffect(
    useCallback(() => {
      if (!me) return;
      startPlansSyncOnce();
      void refreshPlans();
    }, [me]),
  );

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
          {session && profile.data && (
            <Pressable accessibilityRole="button" onPress={() => setEditingUsername((v) => !v)}>
              <Text style={styles.link}>{profile.data.username ? `@${profile.data.username} · Edit username` : 'Choose a username'}</Text>
            </Pressable>
          )}
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
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {editingUsername && profile.data && (
          <UsernameForm
            initial={profile.data.username ?? ''}
            onSaved={() => {
              setEditingUsername(false);
              profile.reload();
            }}
            onSkip={() => setEditingUsername(false)}
            skipLabel="Cancel"
          />
        )}
        {session === null && <SignInPrompt why="Save your hunts so they’re never lost if you switch phones. Sign in to keep your private Hunt Log backed up to your account." />}
        <View style={styles.menu} testID="profile-menu" accessibilityRole="menu">
          <MenuRow testID="menu-hunt-log" icon="book-outline" label="Hunt log" summary={huntSummary(p.entries.length)} href="/profile/hunt-log" />
          <MenuRow testID="menu-stats" icon="bar-chart-outline" label="Stats" summary="Days afield, flushes, hours and places" href="/profile/stats" />
          <MenuRow testID="menu-dogs" icon="paw-outline" label="Dogs" summary={dogsSummary(p.dogs)} href="/profile/dogs" />
          <MenuRow testID="menu-plans" icon="calendar-outline" label="Plans" summary={plansSummary(session ? plans : null, !!session)} href="/profile/plans" />
        </View>

        <ProfileStatsSection />

        <View style={styles.more}>
          <MenuRow compact testID="menu-trophies" icon="trophy-outline" label="Trophies & badges" summary={badgesSummary(p.badges)} href="/profile/trophies" />
          <MenuRow compact testID="menu-life-list" icon="list-outline" label="Life list" summary={lifeSummary(p.life)} href="/profile/life-list" />
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
  menu: { gap: space.sm },
  more: { gap: space.sm, marginTop: space.md },
  link: { color: colors.accent, fontFamily: fonts.bodySemi },
});
