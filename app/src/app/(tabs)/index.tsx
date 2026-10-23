import { PENDING_CHIP_HEIGHT, PendingChip, usePendingChipShown } from '@/components/FieldSync';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
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
import { readJson, writeJson } from '@/lib/localStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet, useBottomSheetScroll } from '@/components/BottomSheet';
import { PlanTripHint } from '@/components/guide/PlanTripHint';
import { LocateButton } from '@/components/map/LocateButton';
import { PlaceMap } from '@/components/map/PlaceMap';
import { StateParkSheet } from '@/components/StateParkSheet';
import { StockingList, windowText } from '@/components/StockingList';
import { pinColor, visibleBasemaps, type Basemap } from '@/components/map/types';
import { Tag } from '@/components/Tag';
import { Button, Chip, Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import { accessLabel } from '@/data/access';
import { pointInGeometry } from '@/lib/geo';
import { needsAccount } from '@/lib/gate';
import { openLocationSettings, useMyLocation } from '@/lib/location';
import { loadPlaces, useAsync, useDataSources, usePlaces, useSession } from '@/data/hooks';
import {
  DOVE_LINE,
  ENROLLED_PRIVATE_LINE,
  layerDateFor,
  MAP_BANNER,
  MAP_BANNER_SHORT,
  PEEK_SURVEY_LINE,
  SEASON_ONLY_NOTE,
  SHEET_HEADING,
  sheetText,
  STOCKING_LINE,
  STOCKING_PIN_NOTE,
} from '@/data/mapNotice';
import { legal } from '@/lib/env';
import {
  DEVICE,
  dismissNoticeFor,
  isNoticeDismissed,
  noticeDismissEnabled,
  noticeUpdatedFor,
  restoreNoticeFor,
  syncNoticeOnSignIn,
  type DismissMethod,
} from '@/lib/noticeDismiss';
import { useEntitlements } from '@/entitlements';
import { useOfflineMapSource, withOfflineOutline } from '@/offline';
import { STOCKING_SOURCE, stockingCountyOf, windowsForCounty } from '@/data/places';
import { PGC_DIGEST_URL } from '@/data/regs';
import { STATE_PARKS } from '@/data/stateParks';
import { describeStatus, placeToday, SEASON_YEAR, type PlaceToday } from '@/data/seasons';
import { migratory, placeTypeLabel, speciesLabel, type Place, type PlaceType } from '@/data/types';
import { formatDay, formatTime, todayET } from '@/lib/time';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

const filters: { key: PlaceType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'game_land', label: 'Game Lands' },
  { key: 'stocking', label: 'Stocking' },
  { key: 'dove_field', label: 'Dove Fields' },
];

/** Spec (Oct 23): PEEK 200 pt with a place shown. */
const PEEK = 200;
/** Nothing selected: just the handle and the spot count. */
const PEEK_EMPTY = 84;
/** FULL stops this far below the map notice banner (spec: 8 pt). */
const FULL_GAP = 8;
const LIST_LIMIT = 60;

const BASEMAP_KEY = 'birdbrain.basemap.v1';

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { hint } = useLocalSearchParams<{ hint?: string }>();
  const { height } = useWindowDimensions();
  const { places: all, loading, error } = usePlaces();
  const [filter, setFilter] = useState<PlaceType | 'all'>('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [basemap, setBasemapState] = useState<Basemap>('topo');
  // Persisted (spec §5); defaults to Standard. Unknown or hidden values fall back to Standard.
  useEffect(() => {
    readJson<Basemap>(BASEMAP_KEY, 'topo').then((b) => setBasemapState(visibleBasemaps().some((o) => o.key === b) ? b : 'topo'), () => {});
  }, []);
  const setBasemap = (b: Basemap) => {
    setBasemapState(b);
    void writeJson(BASEMAP_KEY, b);
  };
  const [selectedId, setSelectedId] = useState<string>();
  const [parkId, setParkId] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<{ center: Place['center']; key: number; zoom?: number }>();
  const [planner, setPlanner] = useState(false);
  const [fullNotice, setFullNotice] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  // The sheet's top never rises above the banner block (search, layers, banner, expanded notice).
  const [screenH, setScreenH] = useState(height);
  const [topH, setTopH] = useState(0);
  const session = useSession();
  // Dismissible notice: flag on AND a real signed-in account (legal conditions 1–5).
  const dismissFlag = noticeDismissEnabled();
  // Option A: the owner is the signed-in account, or this phone when signed out (synced at sign-in).
  const accountId = session && !session.anonymous ? session.userId : null;
  const noticeUser = dismissFlag ? (accountId ?? DEVICE) : null;
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [noticeUpdated, setNoticeUpdated] = useState(false);
  useEffect(() => {
    let live = true;
    setNoticeDismissed(false);
    setNoticeUpdated(false);
    if (noticeUser) {
      const load = () => {
        isNoticeDismissed(noticeUser).then((d) => live && setNoticeDismissed(d), () => {});
        noticeUpdatedFor(noticeUser).then((u) => live && setNoticeUpdated(u), () => {});
      };
      load();
      // Cross-device: pull the account's state (and upload this phone's queue), then re-read.
      if (noticeUser !== DEVICE) syncNoticeOnSignIn(noticeUser).then(load, () => {});
    }
    return () => {
      live = false;
    };
  }, [noticeUser]);
  /** Only "Got it" and the close button call this (Option A: signed out too, kept on the phone). */
  const dismissNotice = useCallback(
    (method: DismissMethod) => {
      setFullNotice(false);
      if (!noticeUser) return;
      dismissNoticeFor(noticeUser, undefined, method).then(
        (ok) => ok && (setNoticeDismissed(true), setNoticeUpdated(false)),
        () => {},
      );
    },
    [noticeUser],
  );
  /** "Show on map": the banner comes back and the dismissal is cleared. */
  const restoreNotice = useCallback(() => {
    setFullNotice(false);
    setNoticeDismissed(false);
    restoreNoticeFor(noticeUser).catch(() => {});
  }, [noticeUser]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const refreshSaved = useCallback(() => {
    backend.savedPlaceIds().then(setSavedIds, () => {});
  }, []);
  useEffect(refreshSaved, [refreshSaved, session]);

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
    setParkId(undefined);
    // Spec: opening a place shows PEEK; another place keeps the current detent.
  }, []);
  /** Tap on empty map: close every open menu/popup and the keyboard, collapse the sheet to peek. */
  const onEmptyTap = useCallback(() => {
    Keyboard.dismiss();
    setSelectedId(undefined);
    setParkId(undefined);
    setPlanner(false);
    setLayersOpen(false);
    setExpanded(false);
  }, []);
  const onSelectPark = useCallback((id: string) => {
    setSelectedId(undefined);
    setPlanner(false);
    setParkId(id);
    setExpanded(true);
  }, []);
  const park = STATE_PARKS.find((p) => p.id === parkId);

  const pick = (place: Place) => {
    setSelectedId(place.id);
    setFocus({ center: place.center, key: Date.now() });
    setExpanded(true);
  };

  const { canUse } = useEntitlements();
  const offline = useOfflineMapSource(canUse('offlineMaps'));

  const detail = useAsync(
    () => (selectedId ? withOfflineOutline(selectedId, () => backend.placeDetail(selectedId)) : Promise.resolve(null)),
    [selectedId],
  );

  const chipShown = usePendingChipShown();
  const peek = selected || planner || park ? PEEK : PEEK_EMPTY;
  const { status: locStatus, location: me, start: startLocation } = useMyLocation();
  const [locMessage, setLocMessage] = useState(false);
  const centerOnMe = async () => {
    if (me) setFocus({ center: { lng: me.lng, lat: me.lat }, key: Date.now(), zoom: 14 });
    const fix = await startLocation();
    if (fix) {
      setLocMessage(false);
      if (!me) setFocus({ center: { lng: fix.lng, lat: fix.lat }, key: Date.now(), zoom: 14 });
    } else setLocMessage(true);
  };
  // Only the selected place's boundary is loaded, so that's the one we can test against.
  const outline = detail.data?.outline;
  const hereLabel =
    me && selected && outline && pointInGeometry(me.lng, me.lat, outline) ? accessLabel[selected.access] : null;

  return (
    <View style={styles.root} onLayout={(e) => setScreenH(e.nativeEvent.layout.height)}>
      <PlaceMap
        places={places}
        selectedId={selectedId}
        outline={detail.data?.outline}
        basemap={basemap}
        focus={focus}
        onSelect={onMapSelect}
        offline={offline}
        onSelectPark={onSelectPark}
        onEmptyTap={onEmptyTap}
        me={me}
      />

      {!expanded && (
        <View style={[StyleSheet.absoluteFill, { bottom: locateBottom(peek, chipShown) }]} pointerEvents="box-none" testID="locate-slot">
          <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
            <LocateButton
              status={locStatus}
              onPress={centerOnMe}
              onOpenSettings={openLocationSettings}
              onDismiss={() => setLocMessage(false)}
              showMessage={locMessage}
              hereLabel={hereLabel}
            />
          </View>
        </View>
      )}

      <View
        style={[styles.top, { paddingTop: insets.top + space.sm }]}
        pointerEvents="box-none"
        onLayout={(e) => setTopH(e.nativeEvent.layout.height)}
        testID="map-top"
      >
        <View style={styles.titleRow}>
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setSelectedId(undefined);
              setPlanner(false);
              setExpanded(true);
            }}
            placeholder="Search game lands, counties"
            placeholderTextColor={colors.muted}
            style={styles.search}
            accessibilityLabel="Search places"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Map layers"
            accessibilityState={{ expanded: layersOpen }}
            onPress={() => setLayersOpen((v) => !v)}
            style={[styles.layerButton, layersOpen && styles.layerButtonOn]}
            testID="layers-button"
          >
            <Ionicons name="layers-outline" size={20} color={colors.text} />
          </Pressable>
        </View>
        {layersOpen && (
          <View style={styles.layers} testID="layers-panel">
            <Text style={styles.layersTitle}>Map</Text>
            <View style={styles.chips}>
              {visibleBasemaps().map((o) => (
                <Chip key={o.key} label={o.label} icon={o.icon} active={basemap === o.key} onPress={() => setBasemap(o.key)} />
              ))}
            </View>
            <Text style={styles.layersTitle}>Show</Text>
            <View style={styles.chips}>
              {filters.map((f) => (
                <Chip key={f.key} label={f.label} active={f.key === filter} onPress={() => setFilter(f.key)} />
              ))}
              <Chip label="Open today" icon="sunny-outline" active={openOnly} onPress={() => setOpenOnly((v) => !v)} />
            </View>
            <Chip
              label="Stocking planner"
              icon="calendar-outline"
              active={planner}
              onPress={() => {
                setPlanner((v) => !v);
                setSelectedId(undefined);
                setExpanded(true);
                setLayersOpen(false);
              }}
            />
          </View>
        )}
        {/*
          Legal banner: the one-liner toggles the full notice inline (a11y label = full text).
          Flag off (default): always visible, "Got it" only collapses the full notice.
          Flag on: a permanent (i) button always opens the full notice; anyone can
          dismiss the one-liner with the close button or "Got it" (logged, per NOTICE_VERSION).
        */}
        <View style={styles.bannerRow}>
          {!noticeDismissed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={MAP_BANNER}
              accessibilityHint="Double-tap to expand."
              accessibilityState={{ expanded: fullNotice }}
              onPress={() => setFullNotice((v) => !v)}
              style={[styles.banner, { flex: 1 }]}
              testID="map-banner"
            >
              {noticeUpdated && (
                <Text style={styles.noticeUpdated} testID="map-notice-updated">
                  UPDATED NOTICE
                </Text>
              )}
              <Text style={styles.bannerText}>{MAP_BANNER_SHORT}</Text>
            </Pressable>
          )}
          {dismissFlag && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Boundary notice"
              accessibilityState={{ expanded: fullNotice }}
              onPress={() => setFullNotice((v) => !v)}
              hitSlop={8}
              style={styles.noticeInfo}
              testID="map-notice-info"
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.text} />
            </Pressable>
          )}
          {noticeUser && !noticeDismissed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hide boundary notice"
              onPress={() => dismissNotice('close')}
              hitSlop={8}
              style={styles.bannerClose}
              testID="map-banner-dismiss"
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          )}
        </View>
        {fullNotice && (
          <View style={styles.fullNotice} testID="map-full-notice">
            <Text style={styles.bannerText}>{MAP_BANNER}</Text>
            <Text accessibilityRole="link" style={styles.link} onPress={() => router.push('/data-sources')}>
              View data sources ›
            </Text>
            {noticeUser && noticeDismissed && (
              <Button label="Show on map" variant="secondary" onPress={restoreNotice} />
            )}
            <Button
              label="Got it"
              variant="primary"
              onPress={noticeUser ? () => dismissNotice('got_it') : () => setFullNotice(false)}
            />
          </View>
        )}
      </View>

      {/* Spec 04: above the sheet/action bar, never over the trespass banner or map controls. */}
      {!expanded && <PendingChip bottom={peek + space.sm} />}
      <PlanTripHint requested={hint === 'plan'} top={topH + space.sm} />

      <BottomSheet
        expanded={expanded}
        onExpandedChange={setExpanded}
        onClose={
          selected || park
            ? () => {
                setSelectedId(undefined);
                setParkId(undefined);
              }
            : undefined
        }
        peekHeight={selected || planner || park ? PEEK : PEEK_EMPTY}
        expandedHeight={sheetHeight(screenH, topH, height)}
        fullHeight={fullSheetHeight(screenH, topH, height)}
      >
        {park && !selected ? (
          <StateParkSheet park={park} onClose={() => setParkId(undefined)} />
        ) : selected ? (
          <PlaceDetails place={selected} expanded={expanded} onClose={() => setSelectedId(undefined)} onSavedChange={refreshSaved} />
        ) : planner ? (
          <StockingList places={all} savedIds={savedIds} onPick={pick} />
        ) : (
          <View style={{ flex: 1, gap: space.sm }}>
            <Text style={styles.sheetTitle}>
              {loading && !all.length
                ? 'Loading public land…'
                : `${places.length} ${places.length === 1 ? 'spot' : 'spots'} nearby`}
            </Text>
            {error && (
              <View style={{ gap: space.sm }}>
                <Notice tone="error">Couldn’t load places: {error.message}</Notice>
                <Button label="Try again" icon="refresh" onPress={() => loadPlaces(true)} />
              </View>
            )}
            {/* Collapsed: handle + count only. The list appears on pull-up (search expands the sheet). */}
            {expanded && (
              <>
            <Text style={ui.muted}>
              {openIds.size} with a season open today ({formatDay(today)}).{' '}
              {backend.mode === 'sample'
                ? 'Sample data (dev flag).'
                : backend.mode === 'unconfigured'
                  ? 'Not connected to a server. Set app/.env.'
                  : 'Data: Pennsylvania Game Commission.'}
            </Text>
            <SheetList
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
              </>
            )}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

/** The sheet's list, wired so a pull-down at its top drags the sheet instead of scrolling. */
function SheetList<T>(props: ComponentProps<typeof FlatList<T>>) {
  const scroll = useBottomSheetScroll();
  return <FlatList {...props} {...scroll} />;
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

/**
 * Per-species legal hours for today, only where the 2026-27 digest gives a fixed rule
 * the bundled PGC table can fill: pheasant, grouse, fall turkey (½ h before sunrise to
 * ½ h after sunset, hunting hours table) and doves (½ h before sunrise until sunset,
 * digest note 5 "every segment of dove season") and spring gobbler (noon through May 15,
 * digest note 3). Waterfowl is left out: its hours have
 * goose-season exceptions, so it stays in the season list as "check the digest".
 */
export function knownHours(today: PlaceToday) {
  return today.statuses.flatMap(({ species, status }) =>
    status.kind === 'open' && !status.season.youth && species !== 'waterfowl' && status.start && status.end
      ? [{ species, start: status.start, end: status.end }]
      : [],
  );
}

/** Sheet height that keeps a strip of map visible below the banner block at every snap point. */
/** Locate button's bottom: above the sheet peek, or stacked above the pending chip when it shows. */
export function locateBottom(peek: number, chipShown: boolean) {
  return chipShown ? peek + space.sm + PENDING_CHIP_HEIGHT + space.sm : peek + space.lg;
}

/** FULL: top edge 8 pt below the banner block, so it never covers search or the notice. */
export function fullSheetHeight(screenH: number, topH: number, _windowH?: number) {
  return Math.max(sheetHeight(screenH, topH), screenH - topH - FULL_GAP);
}

/** HALF: 50% of the space above the tab bar, never over the banner block. */
export function sheetHeight(screenH: number, topH: number, _windowH?: number) {
  return Math.max(PEEK, Math.min(screenH * 0.5, screenH - topH - FULL_GAP));
}

/** "Pheasant open" when exactly one species is in season here today, else "Season open today". */
export function openTag(today: PlaceToday): string | null {
  if (!today.open) return null;
  const open = today.statuses.filter((s) => s.status.kind === 'open' && !s.status.season.youth);
  return open.length === 1 ? `${speciesLabel[open[0].species]} open` : 'Season open today';
}

function PlaceDetails({
  place,
  expanded,
  onClose,
  onSavedChange,
}: {
  place: Place;
  /** The release card only shows on the expanded sheet. */
  expanded: boolean;
  onClose: () => void;
  onSavedChange?: () => void;
}) {
  const session = useSession();
  const sheetScroll = useBottomSheetScroll();
  // County release weeks from the PGC allocation seed; PGC doesn't publish per-property dates.
  const stockingCounty = stockingCountyOf(place);
  const stocking = place.type === 'stocking' ? windowsForCounty(stockingCounty) : [];
  const today = placeToday(place);
  const needsMigratory = today.statuses.some((s) => migratory.includes(s.species) && s.status.kind !== 'closed');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const layerDate = layerDateFor(place.type, useDataSources());
  const reportError = () =>
    Linking.openURL(
      `${legal.mapErrorReportUrl}?place=${encodeURIComponent(place.id)}&name=${encodeURIComponent(place.name)}`,
    ).catch(() => {});

  useEffect(() => {
    let live = true;
    backend.savedPlaceIds().then((ids) => live && setSaved(ids.includes(place.id)), () => {});
    return () => {
      live = false;
    };
  }, [place.id, session]);

  const toggleSave = async () => {
    if (needsAccount('saveSpot', session)) return router.push('/sign-in');
    try {
      await backend.setPlaceSaved(place.id, !saved);
      setSaved(!saved);
      setSaveError(undefined);
      onSavedChange?.();
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

  const nextRelease = stocking.find((w) => w.windowEnd >= today.date);
  const speciesHours = knownHours(today);

  return (
    <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }} {...sheetScroll}>
      {/* Peek: identity, access, two stats, actions and the full legal notice. */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.sheetTitle}>{place.name}</Text>
          <Text style={ui.muted}>
            {placeTypeLabel[place.type]}
            {place.county ? ` · ${place.county} County` : ''}
            {place.acres ? ` · ${Math.round(place.acres).toLocaleString('en-US')} acres` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to list" onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.tags}>
        <View style={[styles.accessTag, place.access === 'enrolled_private' && styles.accessTagEnrolled]} testID="access-tag">
          <Text style={[styles.accessTagText, place.access === 'enrolled_private' && styles.accessTagEnrolledText]} testID="place-access">
            {accessLabel[place.access]}
            {place.type === 'stocking' ? ` · ${STOCKING_PIN_NOTE}` : ''}
          </Text>
        </View>
        {openTag(today) && <Tag label={openTag(today)!} tone="accent" />}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          {speciesHours.length ? (
            speciesHours.map((h) => (
              <Text key={h.species} style={styles.hoursRow} testID={`hours-${h.species}`}>
                {`${speciesLabel[h.species]} ${formatTime(h.start)}–${formatTime(h.end)}`}
              </Text>
            ))
          ) : (
            <Text style={styles.statValue}>Check digest</Text>
          )}
          <Text style={styles.fine}>Legal hours today</Text>
        </View>
        {place.type === 'stocking' && expanded && (
          <View style={[styles.stat, styles.statDivider]} testID="release-card">
            <Text style={[styles.statValue, { color: colors.dove }]}>{nextRelease ? formatDay(nextRelease.windowStart) : 'None listed'}</Text>
            <Text style={styles.fine}>Next county release wk</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Button
          label="Log hunt here"
          icon="create-outline"
          variant="primary"
          onPress={() => router.push({ pathname: '/new/log', params: { placeId: place.id } })}
          style={{ flex: 2 }}
        />
        <Button
          label={saved ? 'Saved' : 'Save'}
          a11y={saved ? 'Saved' : 'Save privately'}
          icon={saved ? 'bookmark' : 'bookmark-outline'}
          onPress={toggleSave}
          style={{ flex: 1 }}
        />
      </View>
      {saveError && <Notice tone="error">{saveError}</Notice>}

      {/* Legal text stays in full (no truncation) right under the actions. */}
      <View style={styles.notice} testID="place-notice">
        {place.access === 'enrolled_private' && (
          <Text style={ui.body} testID="enrolled-line">
            {ENROLLED_PRIVATE_LINE}
          </Text>
        )}
        <Text style={styles.noticeText} testID="place-map-banner">
          {MAP_BANNER}
        </Text>
        <Text style={styles.noticeText}>
          <Text style={{ fontFamily: fonts.bodySemi }}>{SHEET_HEADING}</Text>
          {noticeDismissEnabled() ? ` ${PEEK_SURVEY_LINE}` : ''} {sheetText(layerDate)}
          {place.type === 'stocking' ? ` ${STOCKING_LINE}` : ''}
          {place.type === 'dove_field' ? ` ${DOVE_LINE}` : ''}
        </Text>
      </View>

      {/* Expanded: the data behind the stats, plus secondary actions. */}
      {place.note && <Text style={ui.body}>{place.note}</Text>}
      <View style={styles.callout}>
        <Text style={styles.calloutTitle}>
          {today.open ? 'Season open today' : 'No season open today'} · {formatDay(today.date)}
        </Text>
        <Text style={styles.fine} testID="season-only-note">
          {SEASON_ONLY_NOTE}
        </Text>
        {today.statuses.map(({ species, status }) => (
          <View key={species} style={styles.statusRow}>
            <Text style={styles.statusSpecies}>{speciesLabel[species]}</Text>
            <Text style={[ui.muted, status.kind === 'open' && { color: colors.text }]}>{describeStatus(status)}</Text>
          </View>
        ))}
        <Text style={styles.fine} testID="place-hours-note">
          Legal hours come from the official PGC hunting-hours table for this spot’s zone, with each species’ rules (the
          same as the Open today card on Plan). Where the table has no time, check the digest. {SEASON_YEAR} statewide
          dates; WMU and zone rules vary.
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open the PGC Hunting & Trapping Digest"
          onPress={() => Linking.openURL(PGC_DIGEST_URL).catch(() => {})}
        >
          <Text style={[styles.fine, { color: colors.accent }]}>Verify in the PGC Hunting & Trapping Digest</Text>
        </Pressable>
      </View>

      {place.type === 'stocking' && (
        <View style={styles.callout}>
          <View style={ui.row}>
            <Ionicons name="calendar-outline" size={18} color={colors.accent} />
            <Text style={styles.calloutTitle}>Pheasant stocking</Text>
          </View>
          {stocking.length ? (
            <>
              <Text style={ui.muted}>{stockingCounty} County release weeks (county totals, not this spot):</Text>
              {stocking.map((w) => (
                <Text key={w.id} style={ui.body}>
                  {windowText(w)} · {w.cocks} roosters · {w.hens} hens
                </Text>
              ))}
            </>
          ) : (
            <Text style={ui.muted}>
              {stockingCounty
                ? 'No release weeks listed for this county. '
                : 'This point has no county in PGC’s data, so release weeks can’t be matched. '}
              Check PGC’s pheasant allocation page.
            </Text>
          )}
          <Text style={styles.fine}>Unofficial summary of {STOCKING_SOURCE.citation} Always verify with PGC.</Text>
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

      <View style={styles.secondary}>
        <Button label="Directions" icon="navigate" onPress={directions} style={{ flex: 1 }} />
      </View>
      <View style={[ui.row, { gap: space.lg, flexWrap: 'wrap' }]}>
        <Text accessibilityRole="link" style={styles.link} onPress={reportError}>
          Report a map error
        </Text>
        <Text accessibilityRole="link" style={styles.link} onPress={() => router.push('/data-sources')}>
          Data sources
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  top: { position: 'absolute', left: 0, right: 0, paddingHorizontal: space.lg, gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  search: {
    flex: 1,
    minHeight: touchTarget,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
  },
  layerButtonOn: { borderColor: colors.accent },
  layers: {
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  layersTitle: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  layerButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  close: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginRight: -space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  accessTag: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.dove },
  // Enrolled private land (designer spec): transparent, 1px dashed dove tan, Inter Medium 12, radius 6, 4/8 padding.
  accessTagEnrolled: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.dove,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  accessTagEnrolledText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.dove },
  accessTagText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text },
  stats: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  stat: { flex: 1, gap: 2 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: space.md },
  hoursRow: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  statValue: { fontFamily: fonts.heading, fontSize: 24, color: colors.text },
  secondary: { flexDirection: 'row', gap: space.sm },
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
  bannerRow: { flexDirection: 'row', gap: space.xs, alignItems: 'stretch' },
  bannerClose: {
    width: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeUpdated: { color: colors.accent, fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.5 },
  noticeInfo: {
    alignSelf: 'flex-end',
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: touchTarget / 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  banner: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  // No maxFontSizeMultiplier and no numberOfLines: the banner must stay fully readable at large text sizes.
  // Body-text size and colors.text (tokens.ts) for normal body contrast.
  bannerText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.text },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: space.lg },
  modalCard: {
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  modalText: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: colors.text },
  fullNotice: {
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  notice: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
  link: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.accent, textDecorationLine: 'underline' },
});
