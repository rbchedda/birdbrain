import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { PlaceholderMap, pinColor } from '@/components/PlaceholderMap';
import { Tag } from '@/components/Tag';
import { samplePlaces } from '@/data/places';
import { migratory, speciesLabel, type Place, type PlaceType } from '@/data/types';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

const filters: { key: PlaceType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'game_land', label: 'Game Lands' },
  { key: 'stocking', label: 'Stocking' },
  { key: 'dove_field', label: 'Dove Fields' },
];

const typeLabel: Record<PlaceType, string> = {
  game_land: 'State Game Lands',
  stocking: 'Pheasant Stocking',
  dove_field: 'Managed Dove Field',
};

const PEEK = 132;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [filter, setFilter] = useState<PlaceType | 'all'>('all');
  const [selected, setSelected] = useState<Place | undefined>();
  const [expanded, setExpanded] = useState(false);

  const places = useMemo(
    () => (filter === 'all' ? samplePlaces : samplePlaces.filter((p) => p.type === filter)),
    [filter],
  );

  const onSelect = useCallback((place: Place) => {
    setSelected(place);
    setExpanded(true);
  }, []);

  return (
    <View style={styles.root}>
      <PlaceholderMap places={places} selectedId={selected?.id} onSelect={onSelect} />

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <Text style={styles.brand}>BirdBrain</Text>
          <Tag label="Pennsylvania" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {filters.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <BottomSheet
        expanded={expanded}
        onExpandedChange={setExpanded}
        peekHeight={PEEK}
        expandedHeight={Math.min(420, height * 0.55)}
      >
        {selected ? <PlaceDetails place={selected} /> : <NearbySummary count={places.length} />}
      </BottomSheet>
    </View>
  );
}

function NearbySummary({ count }: { count: number }) {
  return (
    <View>
      <Text style={styles.sheetTitle}>{count} public spots nearby</Text>
      <Text style={styles.muted}>Tap a pin to see details. Sample data until the PASDA import runs.</Text>
    </View>
  );
}

function PlaceDetails({ place }: { place: Place }) {
  const needsMigratory = place.species.some((s) => migratory.includes(s));
  return (
    <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: pinColor[place.type] }]} />
        <Text style={styles.muted}>
          {typeLabel[place.type]} · {place.county} County
        </Text>
      </View>
      <Text style={styles.sheetTitle}>{place.name}</Text>
      <View style={styles.row}>
        {place.species.map((s) => (
          <Tag key={s} label={speciesLabel[s]} tone={s === 'dove' ? 'dove' : 'neutral'} />
        ))}
      </View>
      <Text style={styles.body}>{place.note}</Text>
      {place.stockingWindow && (
        <View style={styles.callout}>
          <Ionicons name="calendar-outline" size={18} color={colors.accent} />
          <Text style={styles.body}>{place.stockingWindow}</Text>
        </View>
      )}
      {needsMigratory && (
        <View style={styles.callout}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.dove} />
          <Text style={styles.body}>
            Migratory birds: PA migratory bird license required (plus a federal duck stamp for waterfowl). No Sunday
            hunting for migratory game birds. Verify with PGC.
          </Text>
        </View>
      )}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={[styles.button, styles.buttonPrimary]}>
          <Ionicons name="navigate" size={18} color={colors.onAccent} />
          <Text style={[styles.buttonText, { color: colors.onAccent }]}>Directions</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.button}>
          <Ionicons name="bookmark-outline" size={18} color={colors.text} />
          <Text style={styles.buttonText}>Save privately</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  top: { position: 'absolute', left: 0, right: 0, paddingHorizontal: space.lg, gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontFamily: fonts.heading, fontSize: 30, color: colors.text, letterSpacing: 0.5 },
  chips: { gap: space.sm, paddingVertical: space.xs },
  chip: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  chipTextActive: { color: colors.onAccent },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 26, color: colors.text },
  muted: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  callout: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: space.sm },
  button: {
    flex: 1,
    minHeight: touchTarget,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  buttonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
});
