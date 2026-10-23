import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LOCATION_DENIED_MESSAGE, LOCATION_UNAVAILABLE_MESSAGE, type LocationStatus } from '@/lib/location';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Thumb-zone size: bigger than the 44pt minimum so it's easy with gloves. */
export const LOCATE_SIZE = 56;

interface Props {
  status: LocationStatus;
  onPress: () => void;
  onOpenSettings: () => void;
  onDismiss: () => void;
  showMessage: boolean;
  /** Access label of the place the dot is inside, when known. */
  hereLabel?: string | null;
}

export function LocateButton({ status, onPress, onOpenSettings, onDismiss, showMessage, hereLabel }: Props) {
  const message = status === 'denied' ? LOCATION_DENIED_MESSAGE : status === 'unavailable' ? LOCATION_UNAVAILABLE_MESSAGE : null;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {showMessage && message && (
        <View style={styles.card} accessibilityLiveRegion="polite">
          <Text style={styles.text}>{message}</Text>
          <View style={styles.row}>
            {status === 'denied' && (
              <Text accessibilityRole="button" style={styles.link} onPress={onOpenSettings}>
                Open Settings
              </Text>
            )}
            <Text accessibilityRole="button" style={styles.link} onPress={onDismiss}>
              Not now
            </Text>
          </View>
        </View>
      )}
      {hereLabel && !(showMessage && message) && (
        <View style={styles.card} testID="here-label">
          <Text style={styles.text}>You're on: {hereLabel}</Text>
        </View>
      )}
      <Pressable
        testID="locate-button"
        accessibilityRole="button"
        accessibilityLabel="Center map on my location"
        accessibilityHint="Shows where you are on the map"
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
        hitSlop={8}
      >
        <Ionicons name={status === 'granted' ? 'locate' : 'locate-outline'} size={26} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: space.lg, alignItems: 'flex-end', gap: space.sm, maxWidth: 280 },
  button: {
    width: LOCATE_SIZE,
    height: LOCATE_SIZE,
    borderRadius: LOCATE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    gap: space.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  row: { flexDirection: 'row', gap: space.lg },
  link: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accent, paddingVertical: space.xs },
});
