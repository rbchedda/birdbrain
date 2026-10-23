import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  type PanResponderGestureState,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { colors, radius, touchTarget } from '@/theme/tokens';

/** px/ms (spec: 800 pt/s). At or above this a release is a fling: one detent in its direction. */
export const FLING_VELOCITY = 0.8;
/** A release closer than this to where the drag started returns to the starting detent. */
export const RETURN_DISTANCE = 24;
/** Pan activates only past this many pt vertically, and when |dy| > 1.5 x |dx|. */
export const PAN_SLOP = 10;
/** From PEEK, dragging down this fraction of the peek height (or a fling) closes. */
export const CLOSE_FRACTION = 0.6;

/**
 * Snap target for a release. `stops` are translateY offsets (0 = FULL, larger = lower);
 * `start` is the detent the gesture began at, `position` where it was released.
 * Velocity first (one step only), then a < 24 pt move returns to `start`, else the nearest stop.
 */
export function pickStop(stops: number[], start: number, position: number, vy: number): number {
  const sorted = [...stops].sort((a, b) => a - b);
  const i = sorted.reduce((bi, s, k) => (Math.abs(s - start) < Math.abs(sorted[bi] - start) ? k : bi), 0);
  if (vy <= -FLING_VELOCITY) return sorted[Math.max(0, i - 1)];
  if (vy >= FLING_VELOCITY) return sorted[Math.min(sorted.length - 1, i + 1)];
  if (Math.abs(position - start) < RETURN_DISTANCE) return sorted[i];
  return sorted.reduce((best, s) => (Math.abs(s - position) < Math.abs(best - position) ? s : best), sorted[0]);
}

/** Close (deselect) only from PEEK: dragged >= 60% of the peek height down, or a downward fling. */
export function shouldClose(atPeek: boolean, dy: number, vy: number, peekHeight: number) {
  return atPeek && (vy >= FLING_VELOCITY || dy >= CLOSE_FRACTION * peekHeight);
}

/** Vertical enough to be a sheet drag (horizontal chip/photo swipes never are). */
export const isVerticalDrag = (g: Pick<PanResponderGestureState, 'dx' | 'dy'>) =>
  Math.abs(g.dy) > PAN_SLOP && Math.abs(g.dy) > 1.5 * Math.abs(g.dx);

/**
 * Whether the sheet (not the inner list) takes a vertical drag that started on content.
 * Below FULL: always (content doesn't scroll there). At FULL: up scrolls content; down
 * moves the sheet only once the list is at its top.
 */
export function sheetTakesDrag(g: Pick<PanResponderGestureState, 'dx' | 'dy'>, scrollY: number, atFull: boolean) {
  if (!isVerticalDrag(g)) return false;
  if (!atFull) return true;
  return g.dy > 0 && scrollY <= 0;
}

type ScrollProps = {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
  /** Content scrolls only at FULL; below it a drag on content moves the sheet. */
  scrollEnabled: boolean;
  /** No overscroll at the top, so momentum never bounces the sheet. */
  bounces: false;
};
const SheetScrollContext = createContext<ScrollProps | null>(null);

/** Spread onto the sheet's inner ScrollView/FlatList (scroll position, scrollEnabled, bounces). */
export function useBottomSheetScroll(): ScrollProps | Record<string, never> {
  return useContext(SheetScrollContext) ?? {};
}

export type Detent = 'peek' | 'half' | 'full';
const DETENTS: Detent[] = ['peek', 'half', 'full'];

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((r) => live && setReduce(!!r), () => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (r: boolean) => setReduce(r));
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/**
 * Dependency-free (PanResponder) bottom sheet with three detents: PEEK, HALF (`expandedHeight`)
 * and FULL (`fullHeight`), per the Oct 23 gesture spec. The parent owns peek vs. open
 * (`expanded`); the sheet owns HALF vs. FULL. `onClose` (optional) deselects: only from PEEK.
 */
export function BottomSheet({
  expanded,
  onExpandedChange,
  onClose,
  peekHeight,
  expandedHeight,
  fullHeight,
  children,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose?: () => void;
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
  const maxOffset = fullH - peekHeight;
  const midOffset = fullH - expandedHeight;
  const detent: Detent = !expanded ? 'peek' : full && hasFull ? 'full' : 'half';
  const stop = detent === 'peek' ? maxOffset : detent === 'full' ? 0 : midOffset;
  const offset = useRef(new Animated.Value(stop)).current;
  const scrollY = useRef(0);
  const reduceMotion = useReduceMotion();

  const animateTo = useCallback(
    (toValue: number) =>
      (reduceMotion
        ? Animated.timing(offset, { toValue, duration: 150, useNativeDriver: true })
        : Animated.spring(offset, { toValue, damping: 50, stiffness: 500, mass: 1, overshootClamping: true, useNativeDriver: true })
      ).start(),
    [offset, reduceMotion],
  );
  useEffect(() => animateTo(stop), [stop, animateTo]);

  const goTo = useCallback(
    (d: Detent | 'closed') => {
      if (d === 'closed') {
        if (onClose) onClose();
        else animateTo(stop);
        return;
      }
      const target = d === 'full' && !hasFull ? 'half' : d;
      if (target === detent) return animateTo(stop);
      if (target === 'peek') onExpandedChange(false);
      else {
        setFull(target === 'full');
        if (!expanded) onExpandedChange(true);
      }
    },
    [onClose, animateTo, stop, hasFull, detent, onExpandedChange, expanded],
  );
  const step = useCallback(
    (dir: 1 | -1) => {
      const avail = hasFull ? DETENTS : DETENTS.slice(0, 2);
      const i = avail.indexOf(detent) + dir;
      if (i < 0) goTo('closed');
      else goTo(avail[Math.min(i, avail.length - 1)]);
    },
    [hasFull, detent, goTo],
  );

  // Android back: FULL -> HALF -> PEEK -> closed.
  useEffect(() => {
    if (detent === 'peek' && !onClose) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      step(-1);
      return true;
    });
    return () => sub.remove();
  }, [detent, onClose, step]);

  const pan = useMemo(() => {
    const stops = hasFull ? [0, midOffset, maxOffset] : [midOffset, maxOffset];
    const atPeek = detent === 'peek';
    const lowest = atPeek && onClose ? maxOffset + peekHeight : maxOffset;
    const pos = (dy: number) => Math.min(lowest, Math.max(0, stop + dy));
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => sheetTakesDrag(g, scrollY.current, detent === 'full'),
      onMoveShouldSetPanResponder: (_, g) => isVerticalDrag(g),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => offset.setValue(pos(g.dy)),
      onPanResponderRelease: (_, g) => {
        if (onClose && shouldClose(atPeek, g.dy, g.vy, peekHeight)) return goTo('closed');
        const t = pickStop(stops, stop, Math.min(maxOffset, pos(g.dy)), g.vy);
        goTo(t <= 1 && hasFull ? 'full' : t >= maxOffset - 1 ? 'peek' : 'half');
      },
      onPanResponderTerminate: () => animateTo(stop),
    });
  }, [hasFull, midOffset, maxOffset, detent, onClose, peekHeight, stop, offset, goTo, animateTo]);

  const scrollProps = useMemo<ScrollProps>(
    () => ({
      onScroll: (e) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
      },
      scrollEventThrottle: 16,
      scrollEnabled: detent === 'full' || !hasFull,
      bounces: false,
    }),
    [detent, hasFull],
  );

  return (
    <Animated.View
      testID="bottom-sheet"
      style={[styles.sheet, { height: fullH, transform: [{ translateY: offset }] }]}
      {...pan.panHandlers}
    >
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={detent === 'full' || (detent === 'half' && !hasFull) ? 'Collapse details' : 'Expand details'}
        accessibilityValue={{ text: `Place details, ${detent} size` }}
        accessibilityHint="Swipe up or down to resize"
        accessibilityActions={[
          { name: 'increment' },
          { name: 'decrement' },
          { name: 'expand', label: 'Expand' },
          { name: 'collapse', label: 'Collapse' },
          ...(onClose ? [{ name: 'close', label: 'Close' }] : []),
        ]}
        onAccessibilityAction={(e) => {
          const n = e.nativeEvent.actionName;
          if (n === 'increment' || n === 'expand') step(1);
          else if (n === 'decrement' || n === 'collapse') step(-1);
          else if (n === 'close') goTo('closed');
        }}
        // Tap cycles PEEK -> HALF -> FULL -> PEEK.
        onPress={() => goTo(detent === 'peek' ? 'half' : detent === 'half' && hasFull ? 'full' : 'peek')}
        hitSlop={{ top: 12, bottom: 8, left: 0, right: 0 }}
        style={styles.handleArea}
        testID="bottom-sheet-handle"
      >
        <View style={styles.handle} />
      </Pressable>
      <SheetScrollContext.Provider value={scrollProps}>
        <View style={styles.body}>{children}</View>
      </SheetScrollContext.Provider>
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
  handleArea: { height: Math.max(44, touchTarget), alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#9FB2A5' },
  body: { flex: 1, paddingHorizontal: 16 },
});
