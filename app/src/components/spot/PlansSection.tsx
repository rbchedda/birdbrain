import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/States';
import { PlanRow } from '@/components/spot/PlanParts';
import { Button, SectionTitle } from '@/components/ui';
import { refreshPlans, startPlansSyncOnce } from '@/data/hooks';
import { splitPlans, usePlans } from '@/lib/plans';
import { colors, fonts, space } from '@/theme/tokens';

export const PLANS_EMPTY = 'Pick a spot on the map and tap Plan a hunt. You’ll see legal hours, sunrise and the forecast for that day.';

/** Profile › Plans page (spec 07): the only home for plans. Signed-in only (render it only with a session). */
export function PlansSection({ owner, title = true }: { owner: string; /** The Plans page already has a header; hide the in-page title there. */ title?: boolean }) {
  useFocusEffect(
    useCallback(() => {
      startPlansSyncOnce();
      void refreshPlans();
    }, []),
  );
  const plans = usePlans(owner);
  if (!plans) return null;
  const { upcoming, past } = splitPlans(plans);
  return (
    <View testID="profile-plans">
      {title && <SectionTitle>Plans</SectionTitle>}
      {upcoming.length === 0 ? (
        <EmptyState
          testID="plans-empty"
          icon="calendar-outline"
          title="No hunts planned"
          body={PLANS_EMPTY}
          action={{ label: 'Open map', onPress: () => router.navigate('/'), testID: 'plans-empty-map' }}
          secondary={past.length > 0 ? { label: 'See past plans', onPress: () => router.push('/plans/past'), testID: 'plans-empty-past' } : undefined}
        />
      ) : (
        upcoming.map((p) => <PlanRow key={p.id} plan={p} />)
      )}
      {past.length > 0 && upcoming.length > 0 && (
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
