import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ForecastPeriod } from '@/lib/weather/nws';
import { useSpotForecast } from '@/lib/weather/useWeather';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Arrow pointing where the wind is going (NWS direction is where it comes from). */
function WindArrow({ fromDeg }: { fromDeg: number | null }) {
  if (fromDeg === null) return null;
  return (
    <View style={{ transform: [{ rotate: `${(fromDeg + 180) % 360}deg` }] }} testID="forecast-wind-arrow">
      <Ionicons name="arrow-up" size={14} color={colors.subtle} />
    </View>
  );
}

function PeriodCard({ p }: { p: ForecastPeriod }) {
  return (
    <View style={[styles.card, !p.isDaytime && styles.night]} testID="forecast-period" accessible accessibilityLabel={periodA11y(p)}>
      <Text style={styles.name} numberOfLines={1}>
        {p.name}
      </Text>
      <Text style={styles.temp}>{p.temperature === null ? '–' : `${p.temperature}°`}</Text>
      <Text style={styles.short} numberOfLines={2}>
        {p.shortForecast}
      </Text>
      <View style={styles.windRow}>
        <WindArrow fromDeg={p.windFromDeg} />
        <Text style={styles.small} numberOfLines={2}>
          {p.windDirection ? `${p.windDirection} ` : ''}
          {p.windSpeed || '–'}
        </Text>
      </View>
      <Text style={styles.small}>{p.precip === null ? 'Precip –' : `${p.precip}% precip`}</Text>
    </View>
  );
}

export const periodA11y = (p: ForecastPeriod) =>
  [
    p.name,
    p.temperature === null ? null : `${p.isDaytime ? 'high' : 'low'} ${p.temperature} degrees`,
    p.shortForecast,
    p.windSpeed ? `wind ${p.windDirection} ${p.windSpeed}` : null,
    p.precip === null ? null : `${p.precip} percent chance of precipitation`,
  ]
    .filter(Boolean)
    .join(', ');

/** 7-day NWS forecast (day/night periods) for a spot; cached copy with "As of" when there's no signal. */
export function SpotForecast({ spotId, center, active = true }: { spotId: string; center: { lat: number; lng: number }; active?: boolean }) {
  const { forecast, cached, loading, error, asOf, retry } = useSpotForecast(spotId, center, active);
  return (
    <View style={styles.wrap} testID="spot-forecast">
      <View style={styles.head}>
        <Text style={styles.title}>7-day forecast</Text>
        {loading && <ActivityIndicator size="small" color={colors.muted} />}
      </View>
      {forecast && forecast.periods.length > 0 ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {forecast.periods.slice(0, 14).map((p) => (
              <PeriodCard key={p.startTime || p.name} p={p} />
            ))}
          </ScrollView>
          <Text style={styles.small} testID="forecast-as-of">
            {[asOf, cached ? 'saved on this phone' : null, 'National Weather Service'].filter(Boolean).join(' · ')}
          </Text>
        </>
      ) : (
        !loading && !error && <Text style={styles.small}>No forecast yet.</Text>
      )}
      {!!error && (
        <View style={styles.errRow}>
          <Text style={[styles.small, { flex: 1 }]} testID="forecast-error">
            {forecast ? `Couldn't refresh. ${error}` : error}
          </Text>
          <Pressable accessibilityRole="button" onPress={retry} hitSlop={8} testID="forecast-retry">
            <Text style={styles.link}>Retry</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  strip: { gap: space.sm, paddingRight: space.sm },
  card: {
    width: 108,
    gap: 4,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  night: { backgroundColor: colors.surface },
  name: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.subtle },
  temp: { fontFamily: fonts.heading, fontSize: 24, color: colors.text },
  short: { fontFamily: fonts.body, fontSize: 12, color: colors.text, minHeight: 32 },
  windRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.accent },
});
