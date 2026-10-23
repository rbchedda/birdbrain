import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { fullSheetHeight, sheetHeight } from '@/app/(tabs)/index';
import { BottomSheet } from '@/components/BottomSheet';

describe('bottom sheet 75% stop', () => {
  it('full stop is 75% of the window, above mid, and never covers the top block', () => {
    expect(fullSheetHeight(844, 120, 844)).toBeCloseTo(633);
    expect(fullSheetHeight(844, 120, 844)).toBeGreaterThan(sheetHeight(844, 120, 844));
    expect(fullSheetHeight(844, 400, 844)).toBeLessThanOrEqual(844 - 400 + 0.001);
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
