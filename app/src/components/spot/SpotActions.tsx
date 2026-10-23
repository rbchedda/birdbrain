import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import type { LngLat } from '@/data/types';
import { getSignal } from '@/lib/connectivity';
import { distanceKm } from '@/lib/geo';
import { rememberPlace, type PlanPlace } from '@/lib/plans';
import { coordsText, directionsTarget, directionsUrls } from '@/lib/spotPlan';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Spot detail spec: the three equal 62 pt tiles at peek. */
export const TILE_HEIGHT = 62;

export const miles = (km: number) => `${(km * 0.621371).toFixed(1)} mi`;

/**
 * Directions: the system maps chooser (Apple on iOS, Google, Waze) to the
 * parking point, else the spot point. Offline it returns false so the caller
 * shows the coordinates with Copy and the distance instead.
 */
export function openDirections(place: PlanPlace): boolean {
  if (!getSignal().online) return false;
  const u = directionsUrls(directionsTarget(place), place.name);
  const go = (url: string) => () => {
    Linking.openURL(url).catch(() => {});
  };
  Alert.alert('Directions', place.name, [
    ...(Platform.OS === 'ios' ? [{ text: 'Apple Maps', onPress: go(u.apple) }] : []),
    { text: 'Google Maps', onPress: go(u.google) },
    { text: 'Waze', onPress: go(u.waze) },
    { text: 'Cancel', style: 'cancel' as const },
  ]);
  return true;
}

/** Copy coordinates: web clipboard when present, else the system share sheet (has Copy). No clipboard native module is bundled. */
export async function copyCoords(text: string) {
  const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator;
  if (nav?.clipboard?.writeText) return nav.clipboard.writeText(text).catch(() => {});
  await Share.share({ message: text }).catch(() => {});
}

export function OfflineDirections({ place, me, onClose }: { place: PlanPlace; me: LngLat | null; onClose: () => void }) {
  const to = directionsTarget(place);
  const text = coordsText(to);
  return (
    <View style={styles.offline} testID="directions-offline">
      <Text style={styles.offlineTitle}>No signal: maps can’t open</Text>
      <Text style={styles.coords} selectable>
        {text}
      </Text>
      {me && <Text style={styles.fine}>{miles(distanceKm(me, to))} away (straight line)</Text>}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => copyCoords(text)} style={styles.small} testID="copy-coords">
          <Text style={styles.smallText}>Copy</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.small}>
          <Text style={styles.smallText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SpotTiles({ place, me }: { place: PlanPlace; me: LngLat | null }) {
  const [offline, setOffline] = useState(false);
  const push = (sub: 'hunt' | 'plan') => {
    rememberPlace(place);
    router.push({ pathname: sub === 'hunt' ? '/spot/[id]/hunt' : '/spot/[id]/plan', params: { id: place.id } });
  };
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.tiles}>
        <Tile label="Directions" icon="navigate" primary onPress={() => setOffline(!openDirections(place))} testID="tile-directions" />
        <Tile label="What to hunt" icon="leaf-outline" onPress={() => push('hunt')} testID="tile-hunt" />
        <Tile label="Plan a hunt" icon="calendar-outline" onPress={() => push('plan')} testID="tile-plan" />
      </View>
      {offline && <OfflineDirections place={place} me={me} onClose={() => setOffline(false)} />}
    </View>
  );
}

function Tile({
  label,
  icon,
  primary,
  onPress,
  testID,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  primary?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const fg = primary ? colors.onAccent : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.tile, primary && styles.tilePrimary, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={20} color={fg} />
      <Text style={[styles.tileText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: {
    flex: 1,
    height: TILE_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tilePrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  tileText: { fontFamily: fonts.bodySemi, fontSize: 13 },
  offline: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, gap: space.xs },
  offlineTitle: { fontFamily: fonts.bodySemi, color: colors.text },
  coords: { fontFamily: fonts.body, fontSize: 16, color: colors.text },
  fine: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', gap: space.sm },
  small: { minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  smallText: { fontFamily: fonts.bodySemi, color: colors.text },
});
