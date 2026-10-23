import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { PlanRow } from '@/components/spot/PlanParts';
import { useSession } from '@/data/hooks';
import { splitPlans, usePlans } from '@/lib/plans';
import { colors, fonts, space } from '@/theme/tokens';

export default function PastPlans() {
  const session = useSession();
  const plans = usePlans(session?.userId);
  const past = plans ? splitPlans(plans).past : [];
  return (
    <View style={styles.root}>
      <ScreenHeader back title="Past plans" subtitle="Private · only you" />
      <ScrollView contentContainerStyle={styles.body}>
        {plans && !past.length && <Text style={styles.muted}>No past plans yet.</Text>}
        {past.map((p) => (
          <PlanRow key={p.id} plan={p} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  muted: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, paddingVertical: space.lg },
});
