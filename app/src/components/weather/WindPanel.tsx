import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { WindNow } from '@/lib/weather/useWeather';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Small card under the header: conditions at the map center while the wind layer is on. */
export function WindPanel({ now, loading, error }: { now: WindNow | null; loading: boolean; error: string | null }) {
  return (
    <View style={styles.panel} testID="wind-panel" accessibilityLiveRegion="polite">
      {now ? (
        <>
          <View style={styles.row}>
            <Text style={styles.big} testID="wind-panel-temp">
              {now.temperature === null ? '–' : `${now.temperature}°${now.unit}`}
            </Text>
            <Text style={styles.stat} testID="wind-panel-precip">
              {now.precip === null ? 'Precip –' : `${now.precip}% precip`}
            </Text>
            {!!now.wind && <Text style={styles.stat}>Wind {now.wind}</Text>}
            {loading && <ActivityIndicator size="small" color={colors.muted} />}
          </View>
          <Text style={styles.fine} numberOfLines={1}>
            {[now.place ? `Map center near ${now.place}` : 'Map center', now.asOf, 'NWS'].filter(Boolean).join(' · ')}
          </Text>
        </>
      ) : loading ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.muted} />
          <Text style={styles.fine}>Loading wind…</Text>
        </View>
      ) : null}
      {!!error && (
        <Text style={styles.fine} testID="wind-panel-error">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, flexWrap: 'wrap' },
  big: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  stat: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  fine: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});
