import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BirdCard } from '@/components/BirdCard';
import { DigestLink } from '@/components/guide/DigestLink';
import { ScreenHeader } from '@/components/Screen';
import { SectionTitle, ui } from '@/components/ui';
import { birdByKey } from '@/data/birds';
import { gear } from '@/data/gear';
import { segmentsFor } from '@/data/guide';
import { regsFor } from '@/data/regs';
import { formatDay } from '@/lib/time';
import { colors, space } from '@/theme/tokens';

/** Guide › Bird ID › species: photos (placeholders for now), field marks, look-alikes, limits and gear. */
export default function BirdScreen() {
  const { species } = useLocalSearchParams<{ species: string }>();
  const bird = birdByKey(String(species));
  if (!bird) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Bird ID" back />
        <Text style={[ui.body, styles.pad]}>Unknown species.</Text>
      </View>
    );
  }
  const regs = bird.species ? regsFor(bird.species) : null;
  return (
    <View style={styles.root}>
      <ScreenHeader title={bird.name} back />
      <ScrollView contentContainerStyle={styles.body}>
        <DigestLink />
        <BirdCard bird={bird} variant="full" />
        {bird.species && (
          <>
            <SectionTitle>Seasons</SectionTitle>
            <View style={ui.card} testID="bird-seasons">
              {segmentsFor(bird.species).map((seg) => (
                <Text key={seg.label} style={ui.body}>
                  {seg.label}:{' '}
                  {seg.windows ? seg.windows.map(([a, b]) => `${formatDay(a)} – ${formatDay(b)}`).join('; ') : 'dates vary, check the digest'}
                </Text>
              ))}
            </View>
          </>
        )}
        <SectionTitle>Limits</SectionTitle>
        {regs ? (
          <View style={ui.card} testID="bird-limits">
            <Text style={ui.body}>Daily: {regs.daily}</Text>
            <Text style={ui.body}>Possession: {regs.possession}</Text>
            <Text style={ui.muted}>{regs.sundayNote}</Text>
            <DigestLink testID="bird-limits-digest" />
          </View>
        ) : (
          <Text style={ui.body}>{bird.regsNote}</Text>
        )}
        <SectionTitle>Gear</SectionTitle>
        {gear[bird.key].map((g) => (
          <Text key={g.label} style={ui.body}>
            ☐ {g.label}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  pad: { padding: space.lg },
});
