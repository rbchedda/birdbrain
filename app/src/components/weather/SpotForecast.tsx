import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { agoLabel, clockLabel, type ForecastDay, forecastAge, toDays } from '@/lib/weather/days';
import { useSpotForecast } from '@/lib/weather/useWeather';
import { officialDay } from '@/lib/sun';
import { formatTime, todayET } from '@/lib/time';
import { colors, fonts, radius, space } from '@/theme/tokens';

export const NWS_SOURCE_URL = 'https://www.weather.gov/';

const dayTitle = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};
const temp = (n: number | null) => (n === null ? '–' : `${n}°`);

export const dayA11y = (d: ForecastDay) =>
  [
    dayTitle(d.ymd),
    d.windMph === null ? null : `wind ${d.windDirection} ${d.windMph} miles per hour`,
    d.precip === null ? null : `${d.precip} percent chance of rain`,
    d.high === null ? null : `high ${d.high}`,
    d.low === null ? null : `low ${d.low}`,
  ]
    .filter(Boolean)
    .join(', ');

/** Sun + PGC legal hours for a date (offline, lib/sun). Null outside the PGC table. */
function sunLines(ymd: string, lng: number) {
  const o = officialDay(ymd, lng);
  if (!o) return null;
  return {
    sun: `Sunrise ${formatTime(o.sunrise)} · Sunset ${formatTime(o.sunset)}`,
    legal: `Legal hours ${formatTime(o.huntStart)} – ${formatTime(o.huntEnd)} (PGC)`,
  };
}

function Tile({ d, on, onPress, dim }: { d: ForecastDay; on: boolean; onPress: () => void; dim: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={dayA11y(d)}
      onPress={onPress}
      style={[styles.tile, on && styles.tileOn, dim && styles.dim]}
      testID="forecast-day"
    >
      <Text style={styles.tDay}>{d.label}</Text>
      <Text style={styles.tWind} numberOfLines={1}>
        {d.windMph === 0 ? 'Calm' : `${d.windDirection} ${d.windMph ?? '–'}`}
      </Text>
      <Text style={styles.tSmall}>{d.precip === null ? '–' : `${d.precip}%`}</Text>
      <Text style={styles.tTemp} numberOfLines={1}>
        {temp(d.high)}/{temp(d.low)}
      </Text>
    </Pressable>
  );
}

function DayCard({ d, lng }: { d: ForecastDay; lng: number }) {
  const s = sunLines(d.ymd, lng);
  const wind = d.windMph === null ? null : `AM: ${d.windMph === 0 ? 'calm' : `${d.windDirection} ${d.windMph} mph`}${d.windGustMph !== null ? `, gusts ${d.windGustMph}` : ''}`;
  return (
    <View style={styles.card} testID="forecast-day-card">
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{dayTitle(d.ymd)}</Text>
        {s && <Text style={styles.cardSun}>{s.sun}</Text>}
      </View>
      <Text style={styles.cardBody}>{[s?.legal, wind, d.precip === null ? null : `Rain ${d.precip}%`].filter(Boolean).join(' · ')}</Text>
    </View>
  );
}

/**
 * Spot 7-day block (spec wind-forecast 03/04): seven day tiles, a tapped day's
 * card with sun/legal hours, and the stale / expired / unavailable / loading states.
 */
export function SpotForecast({
  spotId,
  center,
  active = true,
  onSource,
}: {
  spotId: string;
  center: { lat: number; lng: number };
  active?: boolean;
  onSource?: () => void;
}) {
  const { forecast, loading, error, errorKind, retry } = useSpotForecast(spotId, center, active);
  const [pick, setPick] = useState<string | null>(null);
  const age = forecast ? forecastAge(forecast.fetchedAt) : null;
  const days = forecast && age !== 'expired' ? toDays(forecast.periods) : [];
  const chosen = days.find((d) => d.ymd === pick) ?? days[0];
  const noSignal = errorKind === 'network' || errorKind === 'timeout';

  let body: React.ReactNode;
  if (days.length) {
    body = (
      <>
        <View style={styles.tiles}>
          {days.map((d) => (
            <Tile key={d.ymd} d={d} on={d.ymd === chosen?.ymd} dim={age === 'stale'} onPress={() => setPick(d.ymd)} />
          ))}
        </View>
        {age === 'stale' ? (
          <Text style={styles.small} testID="forecast-stale">
            ⚠ Saved {agoLabel(forecast!.fetchedAt)} ({clockLabel(forecast!.fetchedAt)}).{noSignal ? ' No signal.' : ''} Will refresh when you're back online.
          </Text>
        ) : (
          <Text style={styles.small}>Wind mph · rain chance · high/low</Text>
        )}
        {chosen && <DayCard d={chosen} lng={center.lng} />}
        <Text style={styles.small} testID="forecast-source">
          National Weather Service · updated {clockLabel(forecast!.updated ?? forecast!.fetchedAt) ?? '–'} ·{' '}
          <Text accessibilityRole="link" onPress={onSource} style={styles.link} testID="forecast-source-link">
            Source ›
          </Text>
        </Text>
      </>
    );
  } else if (forecast && age === 'expired') {
    const s = sunLines(todayET(), center.lng);
    body = (
      <View testID="forecast-expired" style={{ gap: 4 }}>
        <Text style={styles.msg}>Forecast is more than a day old, so it's hidden. Sunrise, sunset and legal hours still work offline.</Text>
        {s && (
          <Text style={styles.small}>
            {dayTitle(todayET())} · {s.sun} · {s.legal.replace('Legal hours', 'Legal').replace(' (PGC)', '')}
          </Text>
        )}
      </View>
    );
  } else if (loading || (!error && active)) {
    body = (
      <View style={styles.tiles} testID="forecast-loading" accessibilityLabel="Loading forecast">
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={[styles.tile, styles.skeleton]} />
        ))}
      </View>
    );
  } else {
    body = (
      <View testID="forecast-unavailable" style={{ gap: space.sm }}>
        <Text style={styles.msg} testID="forecast-error">
          {errorKind === 'outside' ? error : 'Forecast unavailable right now.'}
        </Text>
        {errorKind !== 'outside' && (
          <Pressable accessibilityRole="button" onPress={retry} style={styles.retry} testID="forecast-retry">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="spot-forecast">
      <Text style={styles.title}>7-DAY FORECAST</Text>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  title: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 1, color: colors.muted },
  tiles: { flexDirection: 'row', gap: 4 },
  tile: {
    flex: 1,
    minHeight: 72,
    alignItems: 'center',
    paddingVertical: 6,
    gap: 1,
    borderRadius: radius.md,
    backgroundColor: colors.ground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileOn: { borderColor: colors.accent },
  dim: { opacity: 0.55 },
  skeleton: { backgroundColor: colors.surfaceRaised, borderColor: colors.surfaceRaised },
  tDay: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  tWind: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.subtle },
  tSmall: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  tTemp: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  msg: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  link: { fontFamily: fonts.bodySemi, color: colors.accent },
  card: { gap: 4, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  cardTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.text },
  cardSun: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  cardBody: { fontFamily: fonts.body, fontSize: 13, color: colors.subtle },
  retry: { alignSelf: 'flex-start', paddingHorizontal: space.lg, minHeight: 48, justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.tile },
  retryText: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
});
