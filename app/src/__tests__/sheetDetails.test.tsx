import { fireEvent, render } from '@testing-library/react-native';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { BottomSheet, BACKDROP_OPACITY, dragPosition, HEADER_DRAG_HEIGHT, sheetTakesDrag } from '@/components/BottomSheet';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

function Host() {
  const [expanded, setExpanded] = useState(false);
  return (
    <BottomSheet expanded={expanded} onExpandedChange={setExpanded} peekHeight={80} expandedHeight={300} fullHeight={600}>
      <Text>x</Text>
    </BottomSheet>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const value = (r: { getByTestId: (id: string) => { props: Record<string, any> } }) =>
  r.getByTestId('bottom-sheet-handle').props.accessibilityValue.text;

describe('sheet details (HANDOFF §1)', () => {
  it('scroll handoff in one gesture: the sheet starts where the list stopped, no jump', () => {
    // At FULL, list scrolled 80 pt then reached its top; the sheet takes over at dy = 80.
    expect(sheetTakesDrag({ dx: 0, dy: 80 }, 0, true)).toBe(true);
    expect(dragPosition(0, 80, 80, 500)).toBe(0);
    expect(dragPosition(0, 130, 80, 500)).toBe(50);
    expect(dragPosition(0, 2000, 80, 500)).toBe(500);
  });

  it('the whole header drags at FULL, both ways; content below it still scrolls up', () => {
    expect(HEADER_DRAG_HEIGHT).toBeGreaterThanOrEqual(112);
    expect(sheetTakesDrag({ dx: 0, dy: -20 }, 0, true, true)).toBe(true);
    expect(sheetTakesDrag({ dx: 0, dy: 20 }, 50, true, true)).toBe(true);
    expect(sheetTakesDrag({ dx: 0, dy: -20 }, 0, true, false)).toBe(false);
    expect(sheetTakesDrag({ dx: 40, dy: 20 }, 0, true, true)).toBe(false);
  });

  it('dims the background at FULL only; tapping it returns to HALF', async () => {
    const r = await render(<Host />);
    const bd = () => r.getByTestId('bottom-sheet-backdrop');
    expect(bd().props.pointerEvents).toBe('none');
    expect(r.queryByTestId('bottom-sheet-backdrop-tap', { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(r.getByTestId('bottom-sheet-handle'));
    await fireEvent.press(r.getByTestId('bottom-sheet-handle'));
    expect(value(r)).toBe('Place details, full size');
    expect(bd().props.pointerEvents).toBe('auto');
    expect(StyleSheet.flatten(bd().props.style).opacity).toBeDefined();
    expect(BACKDROP_OPACITY).toBeGreaterThan(0);
    await fireEvent.press(r.getByTestId('bottom-sheet-backdrop-tap', { includeHiddenElements: true }));
    expect(value(r)).toBe('Place details, half size');
  });

  it('moves accessibility focus to the sheet when it opens', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    const r = await render(<Host />);
    spy.mockClear();
    expect(spy).not.toHaveBeenCalled();
    await fireEvent.press(r.getByTestId('bottom-sheet-handle'));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('a search/list result opens the sheet at HALF, even from FULL', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByText('6 spots nearby');
    const h = () => screen.getByTestId('bottom-sheet-handle');
    await fireEvent.press(h());
    await fireEvent.press(h());
    expect(h().props.accessibilityValue.text).toBe('Place details, full size');
    await fireEvent.press(await screen.findByLabelText('State Game Lands (sample A)'));
    await act(async () => {});
    expect(h().props.accessibilityValue.text).toBe('Place details, half size');
  });
});
