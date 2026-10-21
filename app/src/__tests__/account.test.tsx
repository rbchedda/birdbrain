import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { backend } from '@/data';
import { readAgeGate, writeAgeGate } from '@/lib/localStore';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const open = (url: string) => renderRouter('./src/app', { initialUrl: url });

jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

beforeEach(() => AsyncStorage.clear());
afterAll(() => AsyncStorage.clear());

const thisYear = new Date().getFullYear();

describe('13+ age gate on sign-in', () => {
  it('blocks under-13 and remembers it', async () => {
    await open('/sign-in');
    await fireEvent.changeText(await screen.findByLabelText('Birth year'), String(thisYear - 10));
    await fireEvent.press(screen.getByText('Continue'));
    expect(await screen.findByText(/must be 13 or older/)).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByText('Continue as guest')).toBeNull();
    expect(await readAgeGate()).toBe('blocked');
  });

  it('keeps a previously blocked device blocked', async () => {
    await writeAgeGate('blocked');
    await open('/sign-in');
    expect(await screen.findByText(/must be 13 or older/)).toBeTruthy();
    expect(screen.queryByLabelText('Birth year')).toBeNull();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('lets 13+ through to sign-in with legal links', async () => {
    await open('/sign-in');
    expect(screen.queryByLabelText('Email')).toBeNull();
    await fireEvent.changeText(await screen.findByLabelText('Birth year'), String(thisYear - 30));
    await fireEvent.press(screen.getByText('Continue'));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(screen.getByText('Terms of Service')).toBeTruthy();
    expect(await readAgeGate()).toBe('passed');
  });
});

describe('Delete account on profile', () => {
  it('requires confirmation, can be cancelled, then deletes', async () => {
    const spy = jest.spyOn(backend, 'deleteAccount');
    await open('/profile');
    expect(await screen.findByText('Privacy Policy')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Delete account').at(-1)!);
    expect(screen.getByText(/permanently deletes your account/)).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByText(/permanently deletes your account/)).toBeNull();

    await fireEvent.press(screen.getAllByText('Delete account').at(-1)!);
    await fireEvent.press(screen.getByText('Yes, delete my account'));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('shows an error and keeps the account when deletion fails', async () => {
    const spy = jest.spyOn(backend, 'deleteAccount').mockRejectedValueOnce(new Error('network down'));
    await open('/profile');
    await screen.findByText('Privacy Policy');
    await fireEvent.press(screen.getAllByText('Delete account').at(-1)!);
    await fireEvent.press(screen.getByText('Yes, delete my account'));
    expect(await screen.findByText('network down')).toBeTruthy();
    spy.mockRestore();
  });
});
