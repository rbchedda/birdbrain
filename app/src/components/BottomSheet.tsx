import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, touchTarget } from '@/theme/tokens';

/**
 * Dependency-free bottom sheet with up to three stops: peek, mid (`expanded`) and
 * optional full (`fullHeight`). Drag the handle or tap it (tap toggles peek/mid).
 * The parent owns peek vs. open; the sheet owns mid vs. full.
 */
export function BottomSheet({
  expanded,
  onExpandedChange,
  peekHeight,
  expandedHeight,
  fullHeight,
  children,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  peekHeight: number;
  expandedHeight: number;
  fullHeight?: number;
  children: ReactNode;
}) {
  const fullH = Math.max(expandedHeight, fullHeight ?? expandedHeight);
  const hasFull = fullH > expandedHeight + 1;
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!expanded) setFull(false);
  }, [expanded]);
  const stop = !expanded ? fullH - peekHeight : full && hasFull ? 0 : fullH - expandedHeight;
  const maxOffset = fullH - peekHeight;
  const offset = useRef(new Animated.Value(stop)).current;

  useEffect(() => {
    Animated.spring(offset, { toValue: stop, useNativeDriver: true, bounciness: 2 }).start();
  }, [stop, offset]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderMove: (_, g) => {
          offset.setValue(Math.min(maxOffset, Math.max(0, stop + g.dy)));
        },
        onPanResponderRelease: (_, g) => {
          const up = g.dy < -40 || g.vy < -0.5;
          const down = g.dy > 40 || g.vy > 0.5;
          if (up && !expanded) onExpandedChange(true);
          else if (up && expanded && hasFull && !full) setFull(true);
          else if (down && full) setFull(false);
          else if (down && expanded) onExpandedChange(false);
          else Animated.spring(offset, { toValue: stop, useNativeDriver: true }).start();
        },
      }),
    [expanded, full, hasFull, stop, maxOffset, offset, onExpandedChange],
  );

  return (
    <Animated.View
      testID="bottom-sheet"
      style={[styles.sheet, { height: fullH, transform: [{ translateY: offset }] }]}
    >
      <View {...pan.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse details' : 'Expand details'}
          onPress={() => onExpandedChange(!expanded)}
          style={styles.handleArea}
        >
          <View style={styles.handle} />
        </Pressable>
      </View>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  handleArea: { height: touchTarget - 16, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  body: { flex: 1, paddingHorizontal: 16 },
});
