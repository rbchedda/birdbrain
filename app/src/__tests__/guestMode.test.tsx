import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
import { accountActions, gate, needsAccount } from '@/lib/gate';
import { journalEntries } from '@/data/journal';
import { acceptTerms, getConsent, syncConsentOnSignIn } from '@/lib/termsConsent';

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

describe('signed-out browsing', () => {
  it('opens on the Map with no sign-up wall (only #25\'s terms gate)', async () => {
    await acceptTerms();
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByText('6 spots nearby')).toBeTruthy();
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
  });
});

describe('Apple sign-in flag', () => {
  it('is off by default; when on, Apple is the filled primary above email (stubbed until keys exist)', async () => {
    expect(require('@/lib/flags').flags.appleSignIn).toBe(false);
    const { render, fireEvent: fire } = require('@testing-library/react-native');
    const { SignInSheet } = require('@/components/SignInSheet');
    const s = await render(<SignInSheet onDismiss={() => {}} appleEnabled held="SGL 211 · Pheasant" />);
    const order = s.getAllByText(/^Continue with (Apple|email)$/).map((t: { props: { children: string } }) => t.props.children);
    expect(order).toEqual(['Continue with Apple', 'Continue with email']);
    expect(s.getByText('SGL 211 · Pheasant')).toBeTruthy();
    await fire.press(s.getByText('Continue with Apple'));
    expect(await s.findByText(/isn’t available yet/)).toBeTruthy();
  });
});
