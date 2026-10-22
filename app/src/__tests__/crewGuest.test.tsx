import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderRouter, screen } from 'expo-router/testing-library';

import { backend } from '@/data';

// Own file: the session store is module-level and starts once per file.
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

beforeAll(() => {
  jest.spyOn(backend, 'getSession').mockResolvedValue({ userId: 'anon', email: null, anonymous: true });
});

describe('crews for guests', () => {
  const check = async (url: string) => {
    const join = jest.spyOn(backend, 'joinCrew');
    const create = jest.spyOn(backend, 'createCrew');
    await renderRouter('./src/app', { initialUrl: url });
    expect(await screen.findByText(/Crews need an account/)).toBeTruthy();
    expect(screen.getByText('Sign in or create an account')).toBeTruthy();
    expect(screen.queryByText('Join crew')).toBeNull();
    expect(screen.queryByText('Start crew')).toBeNull();
    expect(join).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  };
  it('an invite link asks a guest to create an account', () => check('/crew/invite?token=a1b2c3d4e5f6a7b8c9d0'));
  it('start-or-join asks a guest to create an account', () => check('/crew/invite'));
});
afterAll(() => AsyncStorage.clear());
