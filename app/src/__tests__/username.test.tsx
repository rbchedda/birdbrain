import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
import type { Profile } from '@/data/types';
import { acceptTerms } from '@/lib/termsConsent';
import { saveUsername, TAKEN, validateUsername } from '@/lib/username';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

const me: Session = { userId: 'u1', email: 'a@example.test' };
jest.spyOn(backend, 'getSession').mockResolvedValue(me);
jest.spyOn(backend, 'onSessionChange').mockReturnValue(() => {});
jest.spyOn(backend, 'recordTermsAcceptance').mockResolvedValue(undefined);
const blank: Profile = { id: 'u1', username: null, displayName: null, hasDog: false };
const profile = jest.spyOn(backend, 'profile');
const update = jest.spyOn(backend, 'updateProfile');

beforeEach(async () => {
  await AsyncStorage.clear();
  await acceptTerms();
  profile.mockReset().mockResolvedValue(blank);
  update.mockReset().mockImplementation(async (p) => ({ ...blank, ...p }) as Profile);
});
afterAll(() => AsyncStorage.clear());

async function signIn() {
  jest.spyOn(backend, 'signIn').mockResolvedValue(undefined);
  await renderRouter('./src/app', { initialUrl: '/sign-in' });
  await fireEvent.changeText(await screen.findByLabelText('Birth year'), '1990');
  await fireEvent.press(screen.getByText('Continue'));
  await fireEvent.changeText(await screen.findByLabelText('Email'), 'a@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'secret1');
  await fireEvent.press(screen.getAllByText('Sign in').at(-1)!);
}

describe('username validation', () => {
  it('accepts 3–20 letters, numbers, underscore; rejects the rest', () => {
    expect(validateUsername('Bird_Dog22')).toBeNull();
    expect(validateUsername('ab')).toMatch(/at least 3/);
    expect(validateUsername('a'.repeat(21))).toMatch(/up to 20/);
    expect(validateUsername('bird dog')).toMatch(/letters, numbers/);
    expect(validateUsername('bird-dog')).toMatch(/letters, numbers/);
  });
  it('stores lowercase and maps 23505 and network errors', async () => {
    await saveUsername('  BirdDog ');
    expect(update).toHaveBeenCalledWith({ username: 'birddog' });
    update.mockRejectedValueOnce(Object.assign(new Error('duplicate key value violates unique constraint "profiles_username_key"'), { code: '23505' }));
    await expect(saveUsername('taken')).rejects.toThrow(TAKEN);
    update.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(saveUsername('offline')).rejects.toThrow(/without signal/);
  });
});

describe('choose-your-username step', () => {
  it('shows after sign-in when username is null, and saves', async () => {
    await signIn();
    expect(await screen.findByText('Choose your username', {}, { timeout: 4000 })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'Ridge_Runner');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ username: 'ridge_runner' }));
    await waitFor(() => expect(screen.queryByText('Choose your username')).toBeNull());
  });

  it('is not shown when a username exists', async () => {
    profile.mockResolvedValue({ ...blank, username: 'already' });
    await signIn();
    await waitFor(() => expect(profile).toHaveBeenCalledWith('u1'));
    expect(await screen.findByText(/Signed in as/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Signed in as/)).toBeNull(), { timeout: 4000 });
    expect(screen.queryByText('Choose your username')).toBeNull();
  });

  it('shows invalid and taken errors without leaving', async () => {
    await renderRouter('./src/app', { initialUrl: '/username' });
    await fireEvent.changeText(await screen.findByLabelText('Username'), 'no spaces');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText(/letters, numbers and underscores/)).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
    update.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    await fireEvent.changeText(screen.getByLabelText('Username'), 'mike_r');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText(TAKEN)).toBeTruthy();
    expect(screen.getByText('Choose your username')).toBeTruthy();
  });

  it('Skip for now leaves without saving', async () => {
    await renderRouter('./src/app', { initialUrl: '/username' });
    await fireEvent.press(await screen.findByText('Skip for now'));
    await waitFor(() => expect(screen.queryByText('Choose your username')).toBeNull());
    expect(update).not.toHaveBeenCalled();
  });
});

describe('Profile username edit', () => {
  it('edits the username from Profile with the same form', async () => {
    profile.mockResolvedValue({ ...blank, username: 'old_name' });
    await renderRouter('./src/app', { initialUrl: '/profile' });
    await fireEvent.press(await screen.findByText('@old_name · Edit username'));
    const field = screen.getByLabelText('Username');
    expect(field.props.value).toBe('old_name');
    await fireEvent.changeText(field, 'New_Name');
    profile.mockResolvedValue({ ...blank, username: 'new_name' });
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ username: 'new_name' }));
    expect(await screen.findByText('@new_name · Edit username')).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();
  });
});
