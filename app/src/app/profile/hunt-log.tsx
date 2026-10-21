import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { OpenToday } from '@/components/OpenToday';
import { PostCard } from '@/components/PostCard';
import { ScreenHeader } from '@/components/Screen';
import { Button, SectionTitle, ui } from '@/components/ui';
import { HeatStrip, HuntLogList, SeasonStatsView, SectionRow, dogsSummary, lifeSummary, useProfileData } from '@/components/profile';
import { backend } from '@/data';
import { useAsync, useSession } from '@/data/hooks';
import { colors, space } from '@/theme/tokens';

/** Profile › Hunt log (wireframe 07). */
export default function HuntLogScreen() {
  const session = useSession();
  const me = session?.userId;
  const p = useProfileData();
  const shared = useAsync(() => (me ? backend.postsBy(me) : Promise.resolve([])), [me]);
  const signedOut = backend.mode === 'supabase' && !session;
  const stuck = p.entries.some((e) => e.sync.status === 'failed' && !e.sync.conflict);
  return (
    <View style={styles.root}>
      <ScreenHeader back title="Hunt log" subtitle="Your private diary" />
      <ScrollView contentContainerStyle={styles.body}>
        <OpenToday />
        <SeasonStatsView stats={p.stats} />
        <SectionTitle>Season view</SectionTitle>
        <HeatStrip heat={p.stats.heat} />
        <SectionTitle>Recent hunts</SectionTitle>
        <HuntLogList entries={p.entries} signedOut={signedOut} />
        {stuck && <Button label="Retry backup now" icon="refresh" onPress={() => void p.retry()} />}
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
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
});
