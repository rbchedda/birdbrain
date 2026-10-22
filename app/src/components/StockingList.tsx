import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Tag } from '@/components/Tag';
import { Gated, useEntitlements } from '@/entitlements';
import { Chip, ui } from '@/components/ui';
import {
  crowdingTips,
  doveFields,
  plannerRows,
  STOCKING_SOURCE,
  type PlannerRow,
  type PlannerSort,
  type StockingWindow,
  stockingCountyOf,
} from '@/data/places';
import { describeStatus, placeToday } from '@/data/seasons';
import type { Place } from '@/data/types';
import { formatDay, todayET } from '@/lib/time';
import { colors, fonts, space } from '@/theme/tokens';

const km = (n: number | null) => (n === null ? '' : ` · ${n < 10 ? n.toFixed(1) : Math.round(n)} km`);

export function windowText(w: StockingWindow) {
  const days = w.windowStart === w.windowEnd ? formatDay(w.windowStart) : `${formatDay(w.windowStart)} – ${formatDay(w.windowEnd)}`;
  return `${w.junior ? 'Junior hunt' : w.label.replace(/-\s+/g, '-').toLowerCase().replace(/^./, (c) => c.toUpperCase())} · ${days}`;
}

/**
 * Stocking planner: stocking points with their county's current/next PGC
 * release week, sorted by window or distance from a saved site, plus dove
 * fields and crowding tips. Distance is only ever from a site the user picked;
 * the app never reads or shows a live location.
 */
export function StockingList({
  places,
  savedIds,
  now = new Date(),
  onPick,
}: {
  places: Place[];
  savedIds: string[];
  now?: Date;
  onPick: (place: Place) => void;
}) {
  const today = todayET(now);
  const { canUse } = useEntitlements();
  const fullCalendar = canUse('stockingCalendar');
  const [sort, setSort] = useState<PlannerSort>('window');
  const [savedOnly, setSavedOnly] = useState(false);
  const [originId, setOriginId] = useState<string | null>(null);
  const savedPlaces = places.filter((p) => savedIds.includes(p.id));
  const origin = places.find((p) => p.id === originId)?.center ?? null;

  const rows = useMemo(
    () => plannerRows(places, { today, origin, savedIds, savedOnly, sort: origin ? sort : 'window' }),
    [places, today, origin, savedIds, savedOnly, sort],
  );
  const doves = useMemo(() => doveFields(places, origin), [places, origin]);

  return (
    <ScrollView contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }} testID="stocking-list">
      <Text style={styles.disclaimer} testID="stocking-disclaimer">
        Unofficial summary. PGC publishes a shipping week per county, not exact days or spots. Always verify with PGC.
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open PGC pheasant allocation"
        onPress={() => Linking.openURL(STOCKING_SOURCE.url).catch(() => {})}
        style={styles.link}
      >
        <Ionicons name="open-outline" size={16} color={colors.accent} />
        <Text style={styles.linkText}>PGC pheasant allocation ({STOCKING_SOURCE.season})</Text>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="By window" active={sort === 'window' || !origin} onPress={() => setSort('window')} />
        <Chip label="By distance" active={sort === 'distance' && !!origin} onPress={() => setSort('distance')} />
        <Chip label="Saved only" icon="bookmark-outline" active={savedOnly} onPress={() => setSavedOnly((v) => !v)} />
      </ScrollView>

      <Text style={ui.muted}>Near:</Text>
      {savedPlaces.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Not set" active={!originId} onPress={() => setOriginId(null)} />
          {savedPlaces.map((p) => (
            <Chip key={p.id} label={p.name} active={originId === p.id} onPress={() => setOriginId(p.id)} />
          ))}
        </ScrollView>
      ) : (
        <Text style={ui.muted}>Save a spot to sort by distance from it. BirdBrain never uses your live location.</Text>
      )}

      <Text style={styles.section}>Stocking points</Text>
      {rows.length === 0 && <Text style={ui.muted}>{savedOnly ? 'No saved stocking points yet.' : 'No stocking points loaded.'}</Text>}
      {rows.map((r) => (
        <StockingRow key={r.place.id} row={r} locked={!fullCalendar && !r.current} onPress={() => onPick(r.place)} />
      ))}
      {!fullCalendar && rows.some((r) => !r.current && r.next) && <Gated feature="stockingCalendar">{null}</Gated>}

      <Text style={styles.section}>Dove fields</Text>
      {doves.length === 0 && <Text style={ui.muted}>No dove fields loaded.</Text>}
      {doves.map(({ place, km: d }) => {
        const status = placeToday(place, now).statuses.find((s) => s.species === 'dove')?.status;
        return (
          <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={place.name} onPress={() => onPick(place)} style={styles.row}>
            <Text style={styles.name}>{place.name}</Text>
            <Text style={ui.muted}>
              {stockingCountyOf(place) ? `${stockingCountyOf(place)} County` : 'County not listed'}
              {km(d)}
              {status ? ` · ${describeStatus(status, now)}` : ''}
            </Text>
          </Pressable>
        );
      })}

      <Text style={styles.section}>Crowding tips</Text>
      {crowdingTips.map((t) => (
        <Text key={t} style={ui.body}>
          • {t}
        </Text>
      ))}

      <Text style={[ui.muted, { marginTop: space.md }]}>{STOCKING_SOURCE.citation}</Text>
    </ScrollView>
  );
}

function StockingRow({ row, locked, onPress }: { row: PlannerRow; locked: boolean; onPress: () => void }) {
  const { place, next, current, saved } = row;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={place.name} onPress={onPress} style={styles.row} testID={`stocking-row-${place.id}`}>
      <View style={ui.row}>
        <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
          {place.name}
        </Text>
        {saved && <Ionicons name="bookmark" size={14} color={colors.accent} />}
        {current && <Tag label="Stocking this week" tone="accent" />}
      </View>
      <Text style={ui.muted}>
        {place.county ? `${place.county} County` : 'County not listed'}
        {km(row.km)}
      </Text>
      <Text style={ui.body}>
        {next && locked
          ? 'Later release weeks: Season Pass. This week’s stocking is always free.'
          : next
          ? `${windowText(next)} · ${next.cocks} roosters, ${next.hens} hens (county total)`
          : stockingCountyOf(place)
            ? 'No more PGC release weeks this season.'
            : 'Release weeks are listed by county; check PGC’s allocation page.'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disclaimer: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.dove },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs },
  linkText: { color: colors.accent, fontFamily: fonts.bodySemi },
  chips: { gap: space.sm },
  section: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text, marginTop: space.md },
  row: { gap: 2, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
});
