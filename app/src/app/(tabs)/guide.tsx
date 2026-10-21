import { useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DEFAULT_AT } from '@/components/OpenToday';
import { DigestLink } from '@/components/guide/DigestLink';
import {
  BagSection,
  BirdIdSection,
  GearSection,
  HoursSection,
  InSeasonSection,
  RegsSection,
} from '@/components/guide/GuideSections';
import { ScreenHeader } from '@/components/Screen';
import { Chip } from '@/components/ui';
import type { BirdKey } from '@/data/birds';
import { GUIDE_SECTIONS, type GuideSection } from '@/data/guide';
import { readJson, writeJson } from '@/lib/localStore';
import { pgcHoursZone } from '@/lib/sun';
import { todayET } from '@/lib/time';
import { colors, space } from '@/theme/tokens';

const ZONE_KEY = 'guide.zone';
const defaultZone = pgcHoursZone(DEFAULT_AT.lng)?.zone ?? 1;

export default function GuideScreen() {
  const navigation = useNavigation();
  // The tab entry belongs to dev-1's _layout.tsx; set the label from here until it points at this screen.
  useLayoutEffect(() => navigation.setOptions({ title: 'Guide' }), [navigation]);

  const now = new Date();
  const ymd = todayET(now);
  const [zone, setZone] = useState(defaultZone);
  const [bird, setBird] = useState<BirdKey>('pheasant');
  const [active, setActive] = useState<GuideSection>('season');
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<GuideSection, number>>>({});

  useEffect(() => {
    readJson<number>(ZONE_KEY, defaultZone).then(setZone);
  }, []);
  const pickZone = (z: number) => {
    setZone(z);
    writeJson(ZONE_KEY, z);
  };
  const jump = (key: GuideSection) => {
    setActive(key);
    scroll.current?.scrollTo({ y: offsets.current[key] ?? 0, animated: true });
  };
  const at = (key: GuideSection) => ({ onLayout: (e: { nativeEvent: { layout: { y: number } } }) => (offsets.current[key] = e.nativeEvent.layout.y) });

  return (
    <View style={styles.root}>
      <ScreenHeader title="Guide" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipBar}>
        {GUIDE_SECTIONS.map((s) => (
          <Chip key={s.key} label={s.label} active={active === s.key} onPress={() => jump(s.key)} />
        ))}
      </ScrollView>
      <View style={styles.top}>
        <DigestLink testID="guide-digest-top" />
      </View>
      <ScrollView ref={scroll} contentContainerStyle={styles.body}>
        <View {...at('season')}>
          <InSeasonSection ymd={ymd} zone={zone} now={now} onZone={pickZone} />
        </View>
        <View {...at('regs')}>
          <RegsSection />
        </View>
        <View {...at('birds')}>
          <BirdIdSection />
        </View>
        <View {...at('gear')}>
          <GearSection bird={bird} onBird={setBird} />
        </View>
        <View {...at('bag')}>
          <BagSection />
        </View>
        <View {...at('hours')}>
          <HoursSection ymd={ymd} zone={zone} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  chipBar: { flexGrow: 0 },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
  top: { paddingHorizontal: space.lg },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
});
