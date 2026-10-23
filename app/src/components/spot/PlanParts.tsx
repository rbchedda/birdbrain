import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePlaces } from '@/data/hooks';
import { speciesLabel, type Place } from '@/data/types';
import { getSignal, onSignal } from '@/lib/connectivity';
import { cachedPlace, type Plan, type PlanPlace } from '@/lib/plans';
import { forecastAvailable, formatDay, hoursText, planSeasonClosed, sunText, todayET } from '@/lib/spotPlan';
import type { Ymd } from '@/lib/time';
import { colors, fonts, radius, space } from '@/theme/tokens';

export const useOnline = () => useSyncExternalStore(onSignal, () => getSignal().online, () => true);

export const toPlanPlace = (p: Place & { parking?: PlanPlace['parking'] }): PlanPlace => ({
  id: p.id,
  name: p.name,
  type: p.type,
  access: p.access,
  center: p.center,
  species: p.species,
  parking: p.parking ?? null,
});

/** A spot by id for pushed screens: the snapshot cached when its tile was tapped (works offline), else the loaded places. */
export function useSpot(id: string | undefined): PlanPlace | null {
  const { places } = usePlaces();
  if (!id) return null;
  const hit = cachedPlace(id);
  if (hit) return hit;
  const p = places.find((x) => x.id === id);
  return p ? toPlanPlace(p) : null;
}

export const FORECAST_LATER = 'Forecast closer to the date';
export const FORECAST_OFFLINE = 'Forecast: needs signal';
/** No forecast source is wired in this build (no approved API); inside 7 days we say so plainly. */
export const FORECAST_NONE = 'Forecast and wind: not available in this build';

/** Step 1 card (spec 04/06): legal hours, sunrise/sunset (computed on the phone, so always shown), forecast line. */
export function PlanDayCard({ place, date }: { place: PlanPlace; date: Ymd }) {
  const online = useOnline();
  const hours = hoursText(place, date);
  const sun = sunText(place, date);
  const forecast = !forecastAvailable(date, todayET()) ? FORECAST_LATER : online ? FORECAST_NONE : FORECAST_OFFLINE;
  return (
    <View style={styles.card} testID="plan-day-card">
      <Text style={styles.cardTitle}>{formatDay(date)}</Text>
      <Text style={styles.body}>{hours ? `Legal hours ${hours}` : 'Legal hours: check the PGC digest for this date'}</Text>
      {sun && <Text style={styles.muted}>{sun}</Text>}
      <Text style={styles.muted} testID="plan-forecast">
        {forecast}
      </Text>
    </View>
  );
}

const dayTile = (ymd: Ymd) => {
  const [wd, md] = formatDay(ymd).split(', ');
  return { wd, md };
};

/** Profile › Plans row (spec 07): min 72 pt, whole row tappable. */
export function PlanRow({ plan }: { plan: Plan }) {
  const t = dayTile(plan.date);
  const hours = hoursText(plan.place, plan.date);
  const closed = planSeasonClosed(plan.place, plan.date, plan.species);
  const waiting = plan.sync !== 'synced';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatDay(plan.date)}, ${plan.place.name}`}
      onPress={() => router.push({ pathname: '/plans/[id]', params: { id: plan.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      testID={`plan-row-${plan.id}`}
    >
      <View style={styles.tile}>
        <Text style={styles.tileWd}>{t.wd}</Text>
        <Text style={styles.tileMd}>{t.md}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {plan.place.name}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {[plan.species.map((s) => speciesLabel[s]).join(', ') || 'Any open species', hours && `Legal ${hours.split(' – ')[0]}`].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.badges}>
          {plan.crew && !plan.shareFailed && <Badge text={`Shared · ${plan.crew.name}`} />}
          {plan.crew && plan.shareFailed && <Badge text="Not shared yet" tone="warn" />}
          {waiting && <Badge text="Saved on phone · waiting to sync" tone="tan" testID="badge-waiting" />}
          {closed && <Badge text="Season closed on this date" tone="warn" testID="badge-closed" />}
        </View>
      </View>
    </Pressable>
  );
}

export function Badge({ text, tone = 'plain', testID }: { text: string; tone?: 'plain' | 'tan' | 'warn'; testID?: string }) {
  return (
    <View style={[styles.badge, tone === 'tan' && styles.badgeTan, tone === 'warn' && styles.badgeWarn]} testID={testID}>
      <Text style={[styles.badgeText, tone === 'warn' && { color: colors.danger }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, gap: 4, backgroundColor: colors.surfaceRaised },
  cardTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  row: { minHeight: 72, flexDirection: 'row', gap: space.md, alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  tile: { width: 52, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tileWd: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted },
  tileMd: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  badgeTan: { backgroundColor: 'transparent', borderColor: colors.dove },
  badgeWarn: { borderColor: colors.danger },
  badgeText: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
});
