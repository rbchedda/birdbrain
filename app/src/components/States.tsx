import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui';
import { getSignal, onSignal } from '@/lib/connectivity';
import { colors, fieldTarget, fonts, radius, space } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

/** Live connectivity (same source as FieldSync and the map). */
export const useOnline = () => useSyncExternalStore(onSignal, () => getSignal().online, () => true);

/** Shared state palette from empty-states-audit.md. */
export const stateColors = {
  offlineBg: '#2a2416',
  offlineBorder: '#6b5a2c',
  offlineText: '#E8C468',
  errorBg: '#33201a',
  errorBorder: '#7a3a22',
  skeleton: '#1f3328',
} as const;

/** Empty: 72pt #264733 tile, Barlow Condensed 24/700 uppercase title, Inter 15/22 #B8C7BC body, one 56pt primary action (+ optional secondary). */
export function EmptyState({
  icon,
  title,
  body,
  action,
  secondary,
  testID,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void; testID?: string };
  secondary?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
}) {
  return (
    <View style={s.empty} testID={testID}>
      <View style={s.tile}>
        <Ionicons name={icon} size={32} color={colors.dove} />
      </View>
      <Text style={s.title} accessibilityRole="header">{title}</Text>
      <Text style={s.body} numberOfLines={3}>{body}</Text>
      {action && <Button label={action.label} variant="primary" onPress={action.onPress} style={s.btn} testID={action.testID} />}
      {secondary && <Button label={secondary.label} onPress={secondary.onPress} style={s.btn} testID={secondary.testID} />}
    </View>
  );
}

/** Offline banner: "No signal · <what still works>. <what waits>." */
export function OfflineBanner({ children, testID = 'offline-banner', style }: { children: string; testID?: string; style?: ViewStyle }) {
  return (
    <View style={[s.offline, style]} testID={testID} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={18} color={stateColors.offlineText} />
      <Text style={s.offlineText}>{`No signal · ${children}`}</Text>
    </View>
  );
}

/** Error: bold first line, reassurance line, 56pt "Try again". */
export function ErrorState({
  title,
  reassurance = 'Your hunts and plans are safe on this phone.',
  onRetry,
  testID = 'error-state',
}: {
  title: string;
  reassurance?: string;
  onRetry?: () => void;
  testID?: string;
}) {
  return (
    <View style={{ gap: space.md }} testID={testID}>
      <View style={s.error} accessibilityRole="alert">
        <Text style={s.errorTitle}>{title}</Text>
        <Text style={s.errorBody}>{reassurance}</Text>
      </View>
      {onRetry && <Button label="Try again" onPress={onRetry} style={s.btnFull} testID={`${testID}-retry`} />}
    </View>
  );
}

/** Skeleton block: #1f3328, radius 10, gentle pulse (static with Reduce Motion). */
export function SkeletonBlock({ height, width = '100%', style }: { height: number; width?: ViewStyle['width']; style?: ViewStyle }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduce) => {
        if (!live || reduce) return;
        loop = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 0.55, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true })]));
        loop.start();
      })
      .catch(() => undefined);
    return () => {
      live = false;
      loop?.stop();
    };
  }, [o]);
  return <Animated.View style={[{ height, width, borderRadius: 10, backgroundColor: stateColors.skeleton, opacity: o }, style]} />;
}

const s = StyleSheet.create({
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.sm },
  tile: { width: 72, height: 72, borderRadius: 16, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.text, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.subtle, textAlign: 'center' },
  btnFull: { minHeight: fieldTarget },
  btn: { minHeight: fieldTarget, alignSelf: 'stretch', marginTop: space.xs },
  offline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: 12, borderRadius: radius.md, backgroundColor: stateColors.offlineBg, borderWidth: 1, borderColor: stateColors.offlineBorder },
  offlineText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: stateColors.offlineText },
  error: { gap: space.xs, padding: space.lg, borderRadius: radius.md, backgroundColor: stateColors.errorBg, borderWidth: 1, borderColor: stateColors.errorBorder },
  errorTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  errorBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.subtle },
});
