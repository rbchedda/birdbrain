import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { readJson, writeJson } from '@/lib/localStore';
import { colors, fonts, radius, space } from '@/theme/tokens';

export const PLAN_TRIP_HINT = 'Pick a spot, then tap Plan a hunt.';
export const PLAN_TRIP_HINT_KEY = 'birdbrain.guide.planTripHintShown';

/** One-time hint when the Map is opened from Guide › Plan a trip. Persisted in AsyncStorage (localStore). */
export function PlanTripHint({ requested, top }: { requested: boolean; top: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!requested) return;
    let live = true;
    readJson<boolean>(PLAN_TRIP_HINT_KEY, false).then((seen) => {
      if (!live || seen) return;
      setShow(true);
      writeJson(PLAN_TRIP_HINT_KEY, true);
    });
    return () => {
      live = false;
    };
  }, [requested]);
  if (!show) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${PLAN_TRIP_HINT} Dismiss`}
      onPress={() => setShow(false)}
      style={[styles.hint, { top }]}
      testID="plan-trip-hint"
    >
      <Text style={styles.text}>{PLAN_TRIP_HINT}</Text>
      <Text style={styles.close}>✕</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  text: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  close: { fontSize: 13, color: colors.muted },
});
