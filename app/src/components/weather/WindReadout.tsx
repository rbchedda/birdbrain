import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { WindHour } from '@/lib/weather/useWeather';
import { clockLabel } from '@/lib/weather/days';
import { colors, fonts, radius, space } from '@/theme/tokens';

const hourLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('en-US', { hour: 'numeric' }) : '';
};

export const windSpeedText = (h: WindHour) =>
  h.mph === 0 ? 'Calm' : `${h.direction || 'Var'} ${h.mph === null ? '–' : h.mph} mph`;

type Props = {
  hour: WindHour | null;
  index: number;
  count: number;
  onStep: (i: number) => void;
  updated: string | null;
  saved: boolean;
  savedAgo: string | null;
  loading: boolean;
  error: string | null;
};

/**
 * Spec 02: one line under search — "SW 9 mph · gusts 16 · 7 AM · NWS forecast,
 * updated 5:10 AM" with a ‹ › hour stepper (now → +48 h, 56 pt targets).
 */
export function WindReadout({ hour, index, count, onStep, updated, saved, savedAgo, loading, error }: Props) {
  const detail = hour
    ? [
        hour.gust !== null ? `gusts ${hour.gust}` : null,
        hourLabel(hour.time),
        saved ? `NWS forecast, saved ${savedAgo}` : `NWS forecast, updated ${clockLabel(updated) ?? '–'}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <View style={styles.bar} testID="wind-readout" accessibilityLiveRegion="polite">
      {hour ? (
        <>
          <Text style={styles.big} testID="wind-readout-speed">
            {windSpeedText(hour)}
          </Text>
          <Text style={styles.detail} numberOfLines={2} testID="wind-readout-detail">
            {detail}
          </Text>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Earlier hour"
              accessibilityState={{ disabled: index <= 0 }}
              disabled={index <= 0}
              onPress={() => onStep(index - 1)}
              hitSlop={{ top: 14, bottom: 14, left: 8, right: 4 }}
              style={styles.step}
              testID="wind-hour-prev"
            >
              <Text style={[styles.chev, index <= 0 && styles.off]}>‹</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Later hour"
              accessibilityState={{ disabled: index >= count - 1 }}
              disabled={index >= count - 1}
              onPress={() => onStep(index + 1)}
              hitSlop={{ top: 14, bottom: 14, left: 4, right: 8 }}
              style={styles.step}
              testID="wind-hour-next"
            >
              <Text style={[styles.chev, index >= count - 1 && styles.off]}>›</Text>
            </Pressable>
          </View>
        </>
      ) : loading ? (
        <>
          <ActivityIndicator size="small" color={colors.muted} />
          <Text style={styles.detail}>Loading wind…</Text>
        </>
      ) : (
        <Text style={styles.detail} testID="wind-readout-error">
          {error ?? 'Wind unavailable right now.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    minHeight: 48,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  big: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  detail: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  stepper: { flexDirection: 'row' },
  // 28 + hitSlop 14+14 = 56 pt tall; 40 wide + slop.
  step: { width: 40, height: 28, alignItems: 'center', justifyContent: 'center' },
  chev: { fontFamily: fonts.bodySemi, fontSize: 24, lineHeight: 26, color: colors.accent },
  off: { color: colors.border },
});
