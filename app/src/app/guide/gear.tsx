import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GearSection } from '@/components/guide/GuideSections';
import { ScreenHeader } from '@/components/Screen';
import type { BirdKey } from '@/data/birds';
import { colors, space } from '@/theme/tokens';

/** Guide › Gear checklist, by species. */
export default function GuideGearScreen() {
  const [bird, setBird] = useState<BirdKey>('pheasant');
  return (
    <View style={styles.root}>
      <ScreenHeader title="Gear checklist" back />
      <ScrollView contentContainerStyle={styles.body}>
        <GearSection bird={bird} onBird={setBird} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
});
