import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProfileStatsSection, SeasonStartsCard, useProfileStats } from '@/components/stats/ProfileStatsSection';
import { UsernameForm } from '@/components/UsernameForm';
import { MenuRow, badgesSummary, dogsSummary, lifeSummary, useProfileData } from '@/components/profile';
import { backend } from '@/data';
import { refreshPlans, startPlansSyncOnce, useAsync, useSession } from '@/data/hooks';
import { seasonLabel } from '@/data/stats';
import { displayName, initials, type Profile } from '@/data/types';
import { splitPlans, usePlans } from '@/lib/plans';
import { formatDay } from '@/lib/time';
import { colors, fieldTarget, fonts, profileBottomPad, radius, space } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Profile: compact header with ⚙, then a menu (Hunt log, Stats, Dogs, Plans).
 * Each row pushes its own full-screen page with a back arrow; there is no tab
 * row or swipe pager. Below the menu: this season's Stats preview, then
 * Trophies and Life list. Account, sign out, delete account and legal live in
 * Settings (⚙).
 */
export const huntSummary = (n: number) => (n === 0 ? 'No hunts yet' : `${n} ${n === 1 ? 'hunt' : 'hunts'} · private diary`);

/** Stats row subtitle with real counts ("5 days afield · 52 flushes"); before any hunt: "Fills in after your first hunt". */
export function statsSummary(days: number, flushes: number): string {
  if (!days) return 'Fills in after your first hunt';
  return `${days} ${days === 1 ? 'day' : 'days'} afield · ${flushes} ${flushes === 1 ? 'flush' : 'flushes'}`;
}

/** Plans row subtitle ("1 upcoming · Sat, Nov 7"). Signed-out copy is unchanged: whether plans need an account is still open with RBChedda. */
export function plansSummary(plans: ReturnType<typeof usePlans>, signedIn: boolean): string {
  if (!signedIn) return 'Sign in to plan hunts';
  if (!plans) return 'Your planned hunts';
  const { upcoming } = splitPlans(plans);
  if (!upcoming.length) return 'Plan a hunt from any spot';
  const next = [...upcoming].sort((a, b) => a.date.localeCompare(b.date))[0];
  return `${upcoming.length} upcoming · ${formatDay(next.date)}`;
}

/** One-row sign-in card (review T3): 72pt, the whole card is the tap target. */
export function BackUpCard({ count }: { count: number }) {
  const line2 = count > 0 ? `${count} ${count === 1 ? 'hunt is' : 'hunts are'} on this phone only.` : 'Keep them if you switch phones.';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back up your hunts. ${line2} Sign in`}
      onPress={() => router.push('/sign-in')}
      style={({ pressed }) => [styles.backup, pressed && { backgroundColor: colors.surfaceRaised }]}
      testID="profile-backup-card"
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.backupTitle}>Back up your hunts</Text>
        <Text style={styles.backupLine} testID="profile-backup-line">{line2}</Text>
      </View>
      <View style={styles.backupBtn}>
        <Text style={styles.backupBtnText}>Sign in</Text>
      </View>
    </Pressable>
  );
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
  const stats = useProfileStats();
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
        <View style={styles.avatar} testID="profile-avatar">
          {session && profile.data ? (
            <Text style={styles.avatarText} testID="profile-avatar-initials">{initials(profile.data)}</Text>
          ) : (
            <Ionicons name="person" size={24} color={colors.muted} testID="profile-avatar-glyph" />
          )}
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
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/profile/settings')} style={styles.gear} testID="profile-gear">
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
        {session === null && <BackUpCard count={p.entries.length} />}
        {stats.empty && <SeasonStartsCard />}
        <View style={styles.menu} testID="profile-menu" accessibilityRole="menu">
          <MenuRow testID="menu-hunt-log" icon="book-outline" label="Hunt log" summary={huntSummary(p.entries.length)} href="/profile/hunt-log" />
          <MenuRow testID="menu-stats" icon="bar-chart-outline" label="Stats" summary={statsSummary(stats.empty ? 0 : (stats.model.tiles.days ?? 0), stats.model.tiles.flushes ?? 0)} href="/profile/stats" />
          <MenuRow testID="menu-dogs" icon="paw-outline" label="Dogs" summary={dogsSummary(p.dogs)} href="/profile/dogs" />
          <MenuRow testID="menu-plans" icon="calendar-outline" label="Plans" summary={plansSummary(session ? plans : null, !!session)} href="/profile/plans" />
        </View>

        <ProfileStatsSection stats={stats} />

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
  // Review T2: 48pt #264733 circle; initials Barlow Condensed 20/700 #E8C468, or a 24pt person glyph when signed out.
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.heading, fontSize: 20, color: colors.dove },
  name: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  // Review T5: 56×56 hit box, 24pt glyph centred, right inset 4.
  gear: { width: fieldTarget, height: fieldTarget, alignItems: 'center', justifyContent: 'center', marginRight: 4 - space.lg },
  body: { paddingHorizontal: space.lg, paddingBottom: profileBottomPad, gap: space.sm },
  backup: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  backupTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  backupLine: { fontFamily: fonts.body, fontSize: 14, color: colors.subtle },
  backupBtn: { minHeight: 48, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  backupBtnText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.onAccent },
  menu: { gap: space.sm },
  more: { gap: space.sm, marginTop: space.md },
  link: { color: colors.accent, fontFamily: fonts.bodySemi },
});
