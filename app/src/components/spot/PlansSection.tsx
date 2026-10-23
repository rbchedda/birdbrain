import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PlanRow } from '@/components/spot/PlanParts';
import { Button, SectionTitle } from '@/components/ui';
import { startPlansSyncOnce } from '@/data/hooks';
import { splitPlans, usePlans } from '@/lib/plans';
import { colors, fonts, space } from '@/theme/tokens';

export const PLANS_EMPTY = 'No hunts planned. Open a spot on the map and tap Plan a hunt.';

/** Profile › Plans (spec 07): the only home for plans. Signed-in only (render it only with a session). */
export function PlansSection({ owner }: { owner: string }) {
  useEffect(startPlansSyncOnce, []);
  const plans = usePlans(owner);
  if (!plans) return null;
  const { upcoming, past } = splitPlans(plans);
  return (
    <View testID="profile-plans">
      <SectionTitle>Plans</SectionTitle>
      {upcoming.length === 0 ? (
        <View style={{ gap: space.sm }} testID="plans-empty">
          <Text style={styles.muted}>{PLANS_EMPTY}</Text>
          <Button label="Open map" icon="map-outline" onPress={() => router.navigate('/')} />
        </View>
      ) : (
        upcoming.map((p) => <PlanRow key={p.id} plan={p} />)
      )}
      {past.length > 0 && (
        <Pressable accessibilityRole="link" onPress={() => router.push('/plans/past')} style={styles.link} testID="past-plans-link">
          <Text style={styles.linkText}>Past plans ›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.accent },
});
