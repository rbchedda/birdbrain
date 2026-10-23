import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text } from 'react-native';

import { fullSheetHeight, sheetHeight } from '@/app/(tabs)/index';
import {
  BottomSheet,
  FLING_VELOCITY,
  isVerticalDrag,
  pickStop,
  sheetTakesDrag,
  shouldClose,
  useBottomSheetScroll,
} from '@/components/BottomSheet';

// translateY stops for a 700 pt sheet: FULL 0, HALF 300, PEEK 500.
const STOPS = [0, 300, 500];
const FAST = FLING_VELOCITY + 0.1;

describe('detent geometry (spec Oct 23)', () => {
  it('FULL stops 8 pt below the banner block and HALF is 50% of the space, never over the banner', () => {
    expect(fullSheetHeight(844, 160)).toBe(844 - 160 - 8);
    expect(sheetHeight(714, 160)).toBe(357);
    expect(fullSheetHeight(844, 160)).toBeGreaterThan(sheetHeight(844, 160));
    expect(fullSheetHeight(844, 600)).toBeLessThanOrEqual(844 - 600);
  });
  it('sheet is sized to the full stop', async () => {
    const { getByTestId } = await render(
      <BottomSheet expanded onExpandedChange={() => {}} peekHeight={80} expandedHeight={400} fullHeight={633}>
        <Text>list</Text>
      </BottomSheet>,
    );
    expect(StyleSheet.flatten(getByTestId('bottom-sheet').props.style).height).toBe(633);
  });
});

describe('release -> detent', () => {
  it('velocity first, one step only: fling down from FULL lands HALF, not closed', () => {
    expect(pickStop(STOPS, 0, 40, FAST)).toBe(300);
    expect(pickStop(STOPS, 300, 290, -FAST)).toBe(0);
    expect(pickStop(STOPS, 500, 480, -FAST)).toBe(300);
    expect(pickStop(STOPS, 500, 400, FAST)).toBe(500);
  });
  it('slow releases snap to the nearest detent, but a < 24 pt move returns to the start', () => {
    expect(pickStop(STOPS, 300, 320, 0.1)).toBe(300);
    expect(pickStop(STOPS, 300, 280, -0.1)).toBe(300);
    expect(pickStop(STOPS, 300, 140, 0)).toBe(0);
    expect(pickStop(STOPS, 300, 420, 0)).toBe(500);
  });
  it('closes only from PEEK: >= 60% of the peek height or a down fling', () => {
    expect(shouldClose(true, 121, 0, 200)).toBe(true);
    expect(shouldClose(true, 100, 0, 200)).toBe(false);
    expect(shouldClose(true, 30, FAST, 200)).toBe(true);
    expect(shouldClose(false, 400, FAST, 200)).toBe(false);
  });
});

describe('drag vs inner scroll handoff', () => {
  it('horizontal chip/photo swipes never move the sheet', () => {
    expect(isVerticalDrag({ dx: 40, dy: 12 })).toBe(false);
    expect(isVerticalDrag({ dx: 8, dy: 9 })).toBe(false);
    expect(sheetTakesDrag({ dx: 40, dy: 20 }, 0, false)).toBe(false);
    expect(isVerticalDrag({ dx: 4, dy: 12 })).toBe(true);
  });
  it('below FULL any vertical drag moves the sheet', () => {
    expect(sheetTakesDrag({ dx: 0, dy: 20 }, 120, false)).toBe(true);
    expect(sheetTakesDrag({ dx: 0, dy: -20 }, 0, false)).toBe(true);
  });
  it('at FULL: scrollY > 0 drag down scrolls; scrollY = 0 drag down moves the sheet; drag up scrolls', () => {
    expect(sheetTakesDrag({ dx: 0, dy: 20 }, 50, true)).toBe(false);
    expect(sheetTakesDrag({ dx: 0, dy: 20 }, 0, true)).toBe(true);
    expect(sheetTakesDrag({ dx: 0, dy: -20 }, 0, true)).toBe(false);
  });
  it('content scrolls only at FULL and never bounces', async () => {
    function List() {
      const p = useBottomSheetScroll();
      return <ScrollView testID="list" {...p} />;
    }
    function Host() {
      const [expanded, setExpanded] = useState(false);
      return (
        <BottomSheet expanded={expanded} onExpandedChange={setExpanded} peekHeight={80} expandedHeight={300} fullHeight={600}>
          <List />
        </BottomSheet>
      );
    }
    const r = await render(<Host />);
    expect(r.getByTestId('list').props.scrollEnabled).toBe(false);
    expect(r.getByTestId('list').props.bounces).toBe(false);
    await fireEvent.press(r.getByTestId('bottom-sheet-handle')); // PEEK -> HALF
    expect(r.getByTestId('list').props.scrollEnabled).toBe(false);
    await fireEvent.press(r.getByTestId('bottom-sheet-handle')); // HALF -> FULL
    expect(r.getByTestId('list').props.scrollEnabled).toBe(true);
    await fireEvent.press(r.getByTestId('bottom-sheet-handle')); // FULL -> PEEK
    expect(r.getByTestId('list').props.scrollEnabled).toBe(false);
  });
});

describe('handle accessibility and back', () => {
  function Host({ onClose }: { onClose?: () => void }) {
    const [expanded, setExpanded] = useState(false);
    return (
      <BottomSheet expanded={expanded} onExpandedChange={setExpanded} onClose={onClose} peekHeight={80} expandedHeight={300} fullHeight={600}>
        <Text>x</Text>
      </BottomSheet>
    );
  }
  const value = (r: Awaited<ReturnType<typeof render>>) => r.getByTestId('bottom-sheet-handle').props.accessibilityValue.text;
  const act11y = (r: Awaited<ReturnType<typeof render>>, actionName: string) =>
    fireEvent(r.getByTestId('bottom-sheet-handle'), 'accessibilityAction', { nativeEvent: { actionName } });

  it('is adjustable; increment / decrement step through detents, decrement at PEEK closes', async () => {
    const onClose = jest.fn();
    const r = await render(<Host onClose={onClose} />);
    const h = r.getByTestId('bottom-sheet-handle');
    expect(h.props.accessibilityRole).toBe('adjustable');
    expect(h.props.accessibilityHint).toBe('Swipe up or down to resize');
    expect(value(r)).toBe('Place details, peek size');
    await act11y(r, 'increment');
    expect(value(r)).toBe('Place details, half size');
    await act11y(r, 'increment');
    expect(value(r)).toBe('Place details, full size');
    await act11y(r, 'decrement');
    await act11y(r, 'decrement');
    expect(value(r)).toBe('Place details, peek size');
    expect(onClose).not.toHaveBeenCalled();
    await act11y(r, 'decrement');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Android back steps FULL -> HALF -> PEEK -> closed', async () => {
    const handlers: (() => boolean)[] = [];
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => handlers.splice(handlers.indexOf(h as () => boolean), 1) };
    });
    const onClose = jest.fn();
    const r = await render(<Host onClose={onClose} />);
    await act11y(r, 'increment');
    await act11y(r, 'increment');
    const back = async () => act(() => void handlers.at(-1)?.());
    await back();
    expect(value(r)).toBe('Place details, half size');
    await back();
    expect(value(r)).toBe('Place details, peek size');
    await back();
    expect(onClose).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
