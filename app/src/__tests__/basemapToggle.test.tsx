import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

describe('Map screen layers panel', () => {
  it('shows Standard, Satellite and Terrain', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await fireEvent.press(await screen.findByTestId('layers-button'));
    expect(await screen.findByText('Standard')).toBeTruthy();
    expect(screen.getByText('Satellite')).toBeTruthy();
    expect(screen.getByText('Terrain')).toBeTruthy();
    expect(screen.queryByText('Topo')).toBeNull();
    expect(screen.getByRole('button', { name: /Standard/ })).toHaveProp('accessibilityState', { selected: true });
    await fireEvent.press(screen.getByRole('button', { name: /Satellite/ }));
    expect(screen.getByRole('button', { name: /Satellite/ })).toHaveProp('accessibilityState', { selected: true });
    expect(screen.getByRole('button', { name: /Standard/ })).toHaveProp('accessibilityState', { selected: false });
    await fireEvent.press(screen.getByRole('button', { name: /Terrain/ }));
    expect(screen.getByRole('button', { name: /Terrain/ })).toHaveProp('accessibilityState', { selected: true });
  });
});
