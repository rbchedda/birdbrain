import { useLocalSearchParams, router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PostCard } from '@/components/PostCard';
import { ScreenHeader } from '@/components/Screen';
import { EmptyState } from '@/components/States';
import { PrivacyPill } from '@/components/stats/parts';
import { Button, Chip, SectionTitle, ui } from '@/components/ui';
import { HeatStrip, HuntLogList, SeasonStatsView, SectionRow, dogsSummary, lifeSummary, useProfileData } from '@/components/profile';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { speciesOf } from '@/data/stats';
import { colors, profileBottomPad, space } from '@/theme/tokens';

/** Profile › Hunt log (wireframe 07). */
export default function HuntLogScreen() {
  const session = useSession();
  const me = session?.userId;
  const p = useProfileData();
  const shared = useAsync(() => (me ? backend.postsBy(me) : Promise.resolve([])), [me]);
  const signedOut = backend.mode === 'supabase' && !session;
  // Opened from a Stats chart ("See these hunts in your log"): show just those hunts, with a Clear chip.
  const q = useLocalSearchParams<{ species?: string; ids?: string; label?: string }>();
  const filtered = useMemo(() => {
    const sp = q.species ? q.species.split(',').filter(Boolean) : [];
    const ids = q.ids ? new Set(q.ids.split(',').filter(Boolean)) : null;
    if (!sp.length && !ids) return null;
    return p.entries.filter((e) => (ids ? ids.has(e.id) || ids.has(e.clientId) : true) && (sp.length ? speciesOf(e).some((x) => sp.includes(x)) : true));
  }, [q.species, q.ids, p.entries]);
  const stuck = p.entries.some((e) => e.sync.status === 'failed' && !e.sync.conflict);
  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile" title="Hunt log" right={<PrivacyPill testID="page-privacy" />} />
      <ScrollView contentContainerStyle={styles.body}>
        {p.data && p.entries.length === 0 ? (
          <EmptyState
            testID="hunt-log-empty"
            icon="book-outline"
            title="No hunts logged yet"
            body="Each hunt you log lands here with species, spot, dog and flushes. Logging works with no signal."
            action={{ label: 'Log a hunt', onPress: () => router.push('/new/log'), testID: 'hunt-log-empty-log' }}
            secondary={{ label: 'Plan a hunt instead', onPress: () => router.push('/'), testID: 'hunt-log-empty-plan' }}
          />
        ) : (
          <>
        <SeasonStatsView stats={p.stats} />
        <SectionTitle>Season view</SectionTitle>
        <HeatStrip heat={p.stats.heat} />
        <SectionTitle>Recent hunts</SectionTitle>
        {filtered && (
          <View style={styles.row}>
            <Chip active label={`${q.label ?? 'Filtered'} · ${filtered.length} ${filtered.length === 1 ? 'hunt' : 'hunts'}  ✕ Clear`} onPress={() => router.setParams({ species: undefined, ids: undefined, label: undefined })} />
          </View>
        )}
        <HuntLogList entries={filtered ?? p.entries} signedOut={signedOut} />
        {stuck && <Button label="Retry backup now" icon="refresh" onPress={() => void p.retry()} />}
          </>
        )}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <SectionRow title="Life list" summary={lifeSummary(p.life)} href="/profile/life-list" />
          </View>
          <View style={{ flex: 1 }}>
            <SectionRow title="Dogs" summary={dogsSummary(p.dogs)} href="/profile/dogs" />
          </View>
        </View>
        {(shared.data?.length ?? 0) > 0 && (
          <>
            <SectionTitle>Shared posts</SectionTitle>
            {shared.data!.map((post) => (
              <PostCard key={post.id} post={post} onDeleted={() => shared.reload()} />
            ))}
          </>
        )}
        <Text style={ui.muted}>Entries are private by default. Saved offline first, then backed up to your account.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: profileBottomPad, gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
});
