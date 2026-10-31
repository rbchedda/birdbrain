import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { Chip, SectionTitle } from '@/components/ui';
import { BadgeGrid, HuntLogList, RecapPreview, useProfileData } from '@/components/profile';
import { colors, profileBottomPad, space } from '@/theme/tokens';

/** Profile › Trophies (wireframe 08): [Hunts] [Badges] [Recap]. */
export default function TrophiesScreen() {
  const p = useProfileData();
  const [tab, setTab] = useState<'hunts' | 'badges' | 'recap'>('badges');
  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile" title="Trophies" subtitle="Effort and variety. No kill counts." />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.row}>
          <Chip label="Hunts" active={tab === 'hunts'} onPress={() => setTab('hunts')} />
          <Chip label="Badges" active={tab === 'badges'} onPress={() => setTab('badges')} />
          <Chip label="Recap" active={tab === 'recap'} onPress={() => setTab('recap')} />
        </View>
        {tab === 'hunts' && <HuntLogList entries={p.entries} />}
        {tab === 'badges' && (
          <>
            <BadgeGrid badges={p.badges} />
            <SectionTitle>Season recap card</SectionTitle>
            <RecapPreview stats={p.stats} dogs={p.dogs} />
          </>
        )}
        {tab === 'recap' && <RecapPreview stats={p.stats} dogs={p.dogs} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: profileBottomPad, gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
});
