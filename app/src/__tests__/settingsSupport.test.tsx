import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

beforeEach(() => AsyncStorage.clear());
afterAll(() => {
  delete process.env.EXPO_PUBLIC_SUPPORT_URL;
  return AsyncStorage.clear();
});

it('Settings → Help → Contact support opens the configured support page', async () => {
  process.env.EXPO_PUBLIC_SUPPORT_URL = 'https://bb.test/support';
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await renderRouter('./src/app', { initialUrl: '/profile/settings' });
  await fireEvent.press(await screen.findByTestId('contact-support'));
  expect(open).toHaveBeenCalledWith('https://bb.test/support');
  open.mockRestore();
});
