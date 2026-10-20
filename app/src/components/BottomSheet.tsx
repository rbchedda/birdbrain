import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, touchTarget } from '@/theme/tokens';

/**
 * Minimal two-stop bottom sheet (peek / expanded). Drag the handle or tap it to
 * toggle. Kept dependency-free for now; swap for @gorhom/bottom-sheet if we
 * need nested scrolling or more snap points.
 */
export function BottomSheet({
  expanded,
  onExpandedChange,
  peekHeight,
  expandedHeight,
  children,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  peekHeight: number;
  expandedHeight: number;
  children: ReactNode;
}) {
  const travel = expandedHeight - peekHeight;
  const offset = useRef(new Animated.Value(expanded ? 0 : travel)).current;

  useEffect(() => {
    Animated.spring(offset, { toValue: expanded ? 0 : travel, useNativeDriver: true, bounciness: 2 }).start();
  }, [expanded, travel, offset]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderMove: (_, g) => {
          const base = expanded ? 0 : travel;
          offset.setValue(Math.min(travel, Math.max(0, base + g.dy)));
        },
        onPanResponderRelease: (_, g) => {
          const next = g.dy < -40 || g.vy < -0.5 ? true : g.dy > 40 || g.vy > 0.5 ? false : expanded;
          if (next === expanded) {
            Animated.spring(offset, { toValue: expanded ? 0 : travel, useNativeDriver: true }).start();
          } else {
            onExpandedChange(next);
          }
        },
      }),
    [expanded, travel, offset, onExpandedChange],
  );

  return (
    <Animated.View
      testID="bottom-sheet"
      style={[styles.sheet, { height: expandedHeight, transform: [{ translateY: offset }] }]}
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
