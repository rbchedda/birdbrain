import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
import { accountActions, gate, needsAccount } from '@/lib/gate';
import { acceptTerms, getConsent, syncConsentOnSignIn } from '@/lib/consent';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

// Signed out for this whole file (the session store loads once per module).
const getSession = jest.spyOn(backend, 'getSession').mockResolvedValue(null);
jest.spyOn(backend, 'onSessionChange').mockReturnValue(() => {});

const me: Session = { userId: 'u1', email: 'a@example.test' };

beforeEach(() => AsyncStorage.clear());
afterAll(() => AsyncStorage.clear());

describe('account gate', () => {
  it('requires an account for saving hunts, spots, crews, feed and any pass', () => {
    expect([...accountActions].sort()).toEqual(['crews', 'feed', 'purchase', 'saveHuntLog', 'saveSpot']);
    for (const a of accountActions) {
      expect(gate(a, null)).toEqual({ allowed: false, reason: 'signIn' });
      expect(needsAccount(a, undefined)).toBe(true);
      expect(gate(a, me).allowed).toBe(true);
    }
  });

  it('checks the paywall only after the account (Weekend Pass needs an account first)', () => {
    const canUse = (f: string) => f !== 'offlineMaps';
    expect(gate('purchase', null, { canUse, feature: 'weekendPass' }).reason).toBe('signIn');
    expect(gate('saveSpot', me, { canUse, feature: 'offlineMaps' })).toEqual({ allowed: false, reason: 'paywall' });
    expect(gate('saveSpot', me, { canUse, feature: 'regs' }).allowed).toBe(true);
  });
});

describe('terms acceptance while signed out (consent adapter for #25)', () => {
  it('stores locally signed out, syncs on a real sign-in, keeps failures queued', async () => {
    const record = jest.spyOn(backend, 'recordTermsAcceptance').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    await acceptTerms();
    await acceptTerms();
    expect(await getConsent()).toEqual(expect.objectContaining({ state: 'accepted', pendingSync: 1 }));
    expect(record).not.toHaveBeenCalled(); // signed out: nothing leaves the device

    getSession.mockResolvedValue(me);
    expect(await syncConsentOnSignIn()).toEqual({ sent: 0, pending: 1 }); // failed, still queued
    expect(await syncConsentOnSignIn()).toEqual({ sent: 1, pending: 0 });
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ termsVersion: expect.any(String), appVersion: expect.any(String) }));
    getSession.mockResolvedValue(null);
    record.mockRestore();
  });

});

describe('signed-out browsing and the Log hunt sheet', () => {
  it('opens on the Map with no sign-up wall', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByText('6 spots')).toBeTruthy();
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
  });

  it('asks for an account on "+ Log hunt", email only while the Apple flag is off', async () => {
    await renderRouter('./src/app', { initialUrl: '/new' });
    await fireEvent.press(await screen.findByTestId('choose-diary'));
    expect(await screen.findByText('Save your hunts so they’re never lost if you switch phones')).toBeTruthy();
    expect(screen.queryByText('Sign in with Apple')).toBeNull();
    expect(screen.getByText('Continue with email')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue with email'));
    expect(await screen.findByText('Create account', {}, { timeout: 3000 }).catch(() => screen.findAllByText('Sign in'))).toBeTruthy();
    expect((await getConsent()).state).toBe('accepted');
  });

  it('never saves a hunt log signed out, even via a deep link', async () => {
    await renderRouter('./src/app', { initialUrl: '/new/log' });
    expect(await screen.findByText('Save your hunts so they’re never lost if you switch phones', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText('Save to diary')).toBeNull();
  });
});

describe('Apple sign-in flag', () => {
  it('makes Apple the primary button when on, stubbed until keys exist', async () => {
    expect(require('@/lib/flags').flags.appleSignIn).toBe(false); // off by default: blocked on Apple keys
    const { render, fireEvent: fire } = require('@testing-library/react-native');
    const { SignInSheet } = require('@/components/SignInSheet');
    const s = await render(<SignInSheet onDismiss={() => {}} appleEnabled />);
    const order = s.getAllByText(/^(Sign in with Apple|Use email instead)$/).map((t: { props: { children: string } }) => t.props.children);
    expect(order).toEqual(['Sign in with Apple', 'Use email instead']);
    await fire.press(s.getByText('Sign in with Apple'));
    expect(await s.findByText(/isn’t available yet/)).toBeTruthy();
  });
});
