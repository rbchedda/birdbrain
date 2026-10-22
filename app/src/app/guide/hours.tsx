import { ScrollView, StyleSheet, View } from 'react-native';

import { BagSection, HoursSection, ZonePicker } from '@/components/guide/GuideSections';
import { useGuideZone } from '@/components/guide/useGuideZone';
import { ScreenHeader } from '@/components/Screen';
import { todayET } from '@/lib/time';
import { colors, space } from '@/theme/tokens';

/** Guide › PGC table: the 8-day shooting-times table and the full bag table. */
export default function GuideHoursScreen() {
  const [zone, pickZone, picked] = useGuideZone();
  const ymd = todayET(new Date());
  return (
    <View style={styles.root}>
      <ScreenHeader title="PGC table" back />
      <ScrollView contentContainerStyle={styles.body}>
        <ZonePicker zone={picked ? zone : null} onChange={pickZone} />
        <HoursSection ymd={ymd} zone={zone} picked={picked} />
        <BagSection />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
});
