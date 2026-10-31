import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { router } from 'expo-router';

import { ScreenHeader } from '@/components/Screen';
import { EmptyState } from '@/components/States';
import { PrivacyPill } from '@/components/stats/parts';
import { PlanRow } from '@/components/spot/PlanParts';
import { useSession } from '@/data/hooks';
import { splitPlans, usePlans } from '@/lib/plans';
import { colors, fonts, profileBottomPad, space } from '@/theme/tokens';

export default function PastPlans() {
  const session = useSession();
  const plans = usePlans(session?.userId);
  const past = plans ? splitPlans(plans).past : [];
  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile/plans" title="Past plans" right={<PrivacyPill testID="page-privacy" />} />
      <ScrollView contentContainerStyle={styles.body}>
        {plans && !past.length && (
          <EmptyState
            testID="past-plans-empty"
            icon="calendar-outline"
            title="No past plans"
            body="Plans move here the day after their date, so you can reuse a good one next season."
            secondary={{ label: 'Back to Plans', onPress: () => (router.canGoBack() ? router.back() : router.replace('/profile/plans')) }}
          />
        )}
        {past.map((p) => (
          <PlanRow key={p.id} plan={p} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: profileBottomPad },
  muted: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, paddingVertical: space.lg },
});
