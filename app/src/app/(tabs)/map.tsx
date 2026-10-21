import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/BottomSheet';
import { PlaceMap } from '@/components/map/PlaceMap';
import { pinColor, type Basemap } from '@/components/map/types';
import { Tag } from '@/components/Tag';
import { Button, Chip, Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import { loadPlaces, useAsync, usePlaces, useSession } from '@/data/hooks';
import { describeStatus, placeToday, SEASON_YEAR } from '@/data/seasons';
import { migratory, placeTypeLabel, speciesLabel, type Place, type PlaceType } from '@/data/types';
import { formatDay, todayET } from '@/lib/time';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

const filters: { key: PlaceType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'game_land', label: 'Game Lands' },
  { key: 'stocking', label: 'Stocking' },
  { key: 'dove_field', label: 'Dove Fields' },
];

const PEEK = 150;
const LIST_LIMIT = 60;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { places: all, loading, error } = usePlaces();
  const [filter, setFilter] = useState<PlaceType | 'all'>('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [basemap, setBasemap] = useState<Basemap>('topo');
  const [selectedId, setSelectedId] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<{ center: Place['center']; key: number }>();

  // `today` is a dependency so open status rolls over at midnight ET.
  const today = todayET();
  const openIds = useMemo(() => new Set(all.filter((p) => placeToday(p).open).map((p) => p.id)), [all, today]);

  const places = useMemo(
    () => all.filter((p) => (filter === 'all' || p.type === filter) && (!openOnly || openIds.has(p.id))),
    [all, filter, openOnly, openIds],
  );
  const selected = all.find((p) => p.id === selectedId);

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q
      ? places.filter((p) => p.name.toLowerCase().includes(q) || (p.county ?? '').toLowerCase().includes(q))
      : places;
    return hits.slice(0, LIST_LIMIT);
  }, [places, query]);

  const onMapSelect = useCallback((id: string | null) => {
    setSelectedId(id ?? undefined);
    if (id) setExpanded(true);
  }, []);

  const pick = (place: Place) => {
    setSelectedId(place.id);
    setFocus({ center: place.center, key: Date.now() });
    setExpanded(true);
  };

  const detail = useAsync(() => (selectedId ? backend.placeDetail(selectedId) : Promise.resolve(null)), [selectedId]);

  return (
    <View style={styles.root}>
      <PlaceMap
        places={places}
        selectedId={selectedId}
        outline={detail.data?.outline}
        basemap={basemap}
        focus={focus}
        onSelect={onMapSelect}
      />

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <Text style={styles.brand}>BirdBrain</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={basemap === 'topo' ? 'Show satellite imagery' : 'Show topo map'}
            onPress={() => setBasemap((b) => (b === 'topo' ? 'imagery' : 'topo'))}
            style={styles.layerButton}
          >
            <Ionicons name={basemap === 'topo' ? 'earth-outline' : 'map-outline'} size={20} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Open today" icon="sunny-outline" active={openOnly} onPress={() => setOpenOnly((v) => !v)} />
          {filters.map((f) => (
            <Chip key={f.key} label={f.label} active={f.key === filter} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      </View>

      <BottomSheet
        expanded={expanded}
        onExpandedChange={setExpanded}
        peekHeight={PEEK}
        expandedHeight={Math.min(560, height * 0.66)}
      >
        {selected ? (
          <PlaceDetails
            place={selected}
            stocking={detail.data?.stocking ?? []}
            onClose={() => setSelectedId(undefined)}
          />
        ) : (
          <View style={{ flex: 1, gap: space.sm }}>
            <Text style={styles.sheetTitle}>
              {loading && !all.length
                ? 'Loading public land…'
                : `${places.length} public ${places.length === 1 ? 'spot' : 'spots'}`}
            </Text>
            <Text style={ui.muted}>
              {openIds.size} open today ({formatDay(today)}).{' '}
              {backend.mode === 'sample' ? 'Sample data until Supabase is connected.' : 'Data: Pennsylvania Game Commission.'}
            </Text>
            {error && (
              <View style={{ gap: space.sm }}>
                <Notice tone="error">Couldn’t load places: {error.message}</Notice>
                <Button label="Try again" icon="refresh" onPress={() => loadPlaces(true)} />
              </View>
            )}
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setExpanded(true)}
              placeholder="Search by name, number or county"
              placeholderTextColor={colors.muted}
              style={ui.input}
              accessibilityLabel="Search places"
            />
            <FlatList
              data={listed}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => <PlaceRow place={item} open={openIds.has(item.id)} onPress={() => pick(item)} />}
              ListFooterComponent={
                places.length > LIST_LIMIT && !query ? (
                  <Text style={[ui.muted, { paddingVertical: space.md }]}>Search or zoom the map to find more.</Text>
                ) : undefined
              }
            />
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

function PlaceRow({ place, open, onPress }: { place: Place; open: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={place.name} onPress={onPress} style={styles.placeRow}>
      <View style={[styles.dot, { backgroundColor: pinColor[place.type] }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.placeName} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={ui.muted} numberOfLines={1}>
          {placeTypeLabel[place.type]}
          {place.county ? ` · ${place.county} County` : ''}
        </Text>
      </View>
      {open && <Tag label="Open today" tone="accent" />}
    </Pressable>
  );
}

function PlaceDetails({
  place,
  stocking,
  onClose,
}: {
  place: Place;
  stocking: { id: string; windowStart: string; windowEnd: string; counts: Record<string, number> }[];
  onClose: () => void;
}) {
  const session = useSession();
  const today = placeToday(place);
  const needsMigratory = today.statuses.some((s) => migratory.includes(s.species) && s.status.kind !== 'closed');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  useEffect(() => {
    let live = true;
    backend.savedPlaceIds().then((ids) => live && setSaved(ids.includes(place.id)), () => {});
    return () => {
      live = false;
    };
  }, [place.id, session]);

  const toggleSave = async () => {
    if (!session) return router.push('/sign-in');
    try {
      await backend.setPlaceSaved(place.id, !saved);
      setSaved(!saved);
      setSaveError(undefined);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  };

  const directions = () => {
    const { lat, lng } = place.center;
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${lat},${lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}>
      <View style={ui.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to list" onPress={onClose} style={styles.backToList}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <View style={[styles.dot, { backgroundColor: pinColor[place.type] }]} />
        <Text style={ui.muted}>
          {placeTypeLabel[place.type]}
          {place.county ? ` · ${place.county} County` : ''}
          {place.acres ? ` · ${Math.round(place.acres).toLocaleString('en-US')} acres` : ''}
        </Text>
      </View>
      <Text style={styles.sheetTitle}>{place.name}</Text>
      {place.note && <Text style={ui.body}>{place.note}</Text>}

      <View style={styles.callout}>
        <Text style={styles.calloutTitle}>{today.open ? 'Open today' : 'Nothing open today'} · {formatDay(today.date)}</Text>
        {today.statuses.map(({ species, status }) => (
          <View key={species} style={styles.statusRow}>
            <Text style={styles.statusSpecies}>{speciesLabel[species]}</Text>
            <Text style={[ui.muted, status.kind === 'open' && { color: colors.text }]}>{describeStatus(status)}</Text>
          </View>
        ))}
        <Text style={styles.fine}>
          Legal hours: ½ hour before sunrise to sunset, computed for this spot. {SEASON_YEAR} statewide dates; WMU and
          zone rules vary. Verify in the PGC Hunting & Trapping Digest.
        </Text>
      </View>

      {place.type === 'stocking' && (
        <View style={styles.callout}>
          <View style={ui.row}>
            <Ionicons name="calendar-outline" size={18} color={colors.accent} />
            <Text style={styles.calloutTitle}>Pheasant stocking</Text>
          </View>
          {stocking.length ? (
            stocking.map((e) => (
              <Text key={e.id} style={ui.body}>
                {formatDay(e.windowStart)} – {formatDay(e.windowEnd)}
                {e.counts.roosters ? ` · ${e.counts.roosters} roosters` : ''}
                {e.counts.hens ? ` · ${e.counts.hens} hens` : ''}
              </Text>
            ))
          ) : (
            <Text style={ui.muted}>No release windows posted yet. PGC publishes them by region before each season.</Text>
          )}
        </View>
      )}

      {needsMigratory && (
        <View style={styles.callout}>
          <View style={ui.row}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.dove} />
            <Text style={styles.calloutTitle}>Migratory birds</Text>
          </View>
          <Text style={ui.body}>
            PA migratory bird license required (plus a federal duck stamp for waterfowl). No Sunday hunting for migratory
            game birds in {SEASON_YEAR}. Verify with PGC.
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button label="Directions" icon="navigate" variant="primary" onPress={directions} style={{ flex: 1 }} />
        <Button
          label={saved ? 'Saved' : 'Save privately'}
          icon={saved ? 'bookmark' : 'bookmark-outline'}
          onPress={toggleSave}
          style={{ flex: 1 }}
        />
      </View>
      <Button
        label="Log a hunt here"
        icon="create-outline"
        onPress={() => router.push({ pathname: '/diary', params: { placeId: place.id } })}
      />
      {saveError && <Notice tone="error">{saveError}</Notice>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  top: { position: 'absolute', left: 0, right: 0, paddingHorizontal: space.lg, gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.text,
    letterSpacing: 0.5,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    overflow: 'hidden',
  },
  layerButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: { gap: space.sm, paddingVertical: space.xs },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 26, color: colors.text },
  placeRow: {
    minHeight: touchTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: space.sm,
  },
  placeName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  backToList: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  callout: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calloutTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  statusRow: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
  statusSpecies: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, width: 76 },
  fine: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted },
  actions: { flexDirection: 'row', gap: space.sm },
});
