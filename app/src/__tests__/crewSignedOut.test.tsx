import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { crewSignInTitle } from '@/components/CrewSignInSheet';
import { notNowLabel } from '@/components/SignInSheet';
import { backend } from '@/data';

// Own file: the session store is module-level and starts once per file.
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

beforeAll(() => {
  jest.spyOn(backend, 'getSession').mockResolvedValue(null);
});

describe('crews when signed out use the #31 sign-in sheet', () => {
  const check = async (url: string) => {
    const join = jest.spyOn(backend, 'joinCrew');
    const create = jest.spyOn(backend, 'createCrew');
    const crew = jest.spyOn(backend, 'crew');
    await renderRouter('./src/app', { initialUrl: url });
    expect(await screen.findByTestId('sign-in-sheet')).toBeTruthy();
    expect(screen.getByText(crewSignInTitle)).toBeTruthy();
    expect(screen.getByLabelText('Continue with email')).toBeTruthy();
    expect(screen.queryByText('Join crew')).toBeNull();
    expect(screen.queryByText('Start crew')).toBeNull();
    expect(join).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(crew).not.toHaveBeenCalled();
  };
  it('an invite link', () => check('/crew/invite?token=a1b2c3d4e5f6a7b8c9d0'));
  it('start-or-join', () => check('/crew/invite'));
  it('a crew page', () => check('/crew/some-crew-id'));
  it('Not now dismisses the sheet', async () => {
    await renderRouter('./src/app', { initialUrl: '/crew/invite' });
    await fireEvent.press(await screen.findByLabelText(notNowLabel));
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
  });
});
afterAll(() => AsyncStorage.clear());
