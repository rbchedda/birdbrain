import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
import { consentBullets, consentCheckboxLabel, TERMS_VERSION, tosSection } from '@/data/terms';
import { appVersion, flushTermsQueue, needsConsent, readQueue, resetTermsConsentCache } from '@/lib/termsConsent';

jest.unmock('@/components/ConsentGate');

const appDir = './src/app';
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const open = (url: string) => renderRouter(appDir, { initialUrl: url });

jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

const ACCEPTED_KEY = 'birdbrain.termsAccepted.v1';
const signedIn: Session = { userId: 'me', email: null, anonymous: false };

beforeEach(async () => {
  await AsyncStorage.clear();
  resetTermsConsentCache();
  jest.restoreAllMocks();
});
afterAll(() => AsyncStorage.clear());

const continueButton = () => screen.getByRole('button', { name: 'Continue' });

describe('Onboarding consent', () => {
  it('shows before the first map view with the four memo bullets', async () => {
    await open('/');
    expect(await screen.findByText('Before you use BirdBrain maps:')).toBeTruthy();
    for (const b of consentBullets) expect(screen.getByText(b)).toBeTruthy();
    expect(screen.queryByText('6 spots')).toBeNull();
    expect(screen.queryByTestId('place-map')).toBeNull();
  });

  it('keeps Continue disabled until the checkbox is checked', async () => {
    await open('/');
    await screen.findByText('Before you use BirdBrain maps:');
    expect(continueButton()).toBeDisabled();
    await fireEvent.press(continueButton());
    expect(screen.getByText('Before you use BirdBrain maps:')).toBeTruthy();

    const box = screen.getByRole('checkbox', { name: consentCheckboxLabel });
    await fireEvent.press(box);
    expect(box).toBeChecked();
    expect(continueButton()).toBeEnabled();
    await fireEvent.press(box);
    expect(continueButton()).toBeDisabled();
  });

  it('logs acceptance with time, app version and terms version, then shows the map', async () => {
    const record = jest.spyOn(backend, 'recordTermsAcceptance');
    await open('/');
    await fireEvent.press(await screen.findByRole('checkbox', { name: consentCheckboxLabel }));
    await fireEvent.press(continueButton());
    expect(await screen.findByText('6 spots')).toBeTruthy();

    expect(record).toHaveBeenCalledTimes(1);
    const a = record.mock.calls[0][0];
    expect(a.termsVersion).toBe(TERMS_VERSION);
    expect(a.appVersion).toBe(appVersion());
    expect(a.appVersion.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(a.acceptedAt))).toBe(false);
    expect(await readQueue()).toEqual([]);
  });

  it('links the Terms of Service with memo section 4D from onboarding', async () => {
    await open('/');
    await fireEvent.press(await screen.findByText('Read the Terms of Service'));
    expect(screen.getByText('Maps, Data and Your Responsibility')).toBeTruthy();
    for (const item of tosSection) expect(screen.getByTestId('tos-maps-data')).toHaveTextContent(item.body, { exact: false });
  });

  it('does not show again for the same terms version', async () => {
    await AsyncStorage.setItem(ACCEPTED_KEY, JSON.stringify({ acceptedAt: new Date().toISOString(), appVersion: '1.0.0', termsVersion: TERMS_VERSION }));
    await open('/');
    expect(await screen.findByText('6 spots')).toBeTruthy();
    expect(screen.queryByText('Before you use BirdBrain maps:')).toBeNull();
  });

  it('shows again when the terms version changes', async () => {
    await AsyncStorage.setItem(ACCEPTED_KEY, JSON.stringify({ acceptedAt: '2026-01-01T00:00:00Z', appVersion: '0.9.0', termsVersion: '2025-01-01' }));
    await open('/');
    expect(await screen.findByText('Before you use BirdBrain maps:')).toBeTruthy();
    expect(needsConsent({ acceptedAt: 'x', appVersion: '1', termsVersion: TERMS_VERSION }, '2099-01-01')).toBe(true);
    expect(needsConsent({ acceptedAt: 'x', appVersion: '1', termsVersion: TERMS_VERSION })).toBe(false);
    expect(needsConsent(null)).toBe(true);
  });
});

describe('Offline acceptance queue', () => {
  it('queues acceptance for a signed-out user and flushes it on sign-in', async () => {
    let session: Session | null = null;
    let onChange: ((s: Session | null) => void) | undefined;
    jest.spyOn(backend, 'getSession').mockImplementation(async () => session);
    jest.spyOn(backend, 'onSessionChange').mockImplementation((cb) => {
      onChange = cb;
      return () => {};
    });
    const record = jest.spyOn(backend, 'recordTermsAcceptance');

    await open('/');
    await fireEvent.press(await screen.findByRole('checkbox', { name: consentCheckboxLabel }));
    await fireEvent.press(continueButton());
    expect(await screen.findByText('6 spots')).toBeTruthy();

    expect(record).not.toHaveBeenCalled();
    const queued = await readQueue();
    expect(queued).toHaveLength(1);
    expect(queued[0].termsVersion).toBe(TERMS_VERSION);

    session = signedIn;
    onChange!(signedIn);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0]).toEqual(queued[0]);
    await waitFor(async () => expect(await readQueue()).toEqual([]));
  });

  it('keeps the acceptance queued when sending fails, and sends it on the next try', async () => {
    const record = jest.spyOn(backend, 'recordTermsAcceptance').mockRejectedValueOnce(new Error('offline'));
    await open('/');
    await fireEvent.press(await screen.findByRole('checkbox', { name: consentCheckboxLabel }));
    await fireEvent.press(continueButton());
    expect(await screen.findByText('6 spots')).toBeTruthy();
    expect(await readQueue()).toHaveLength(1);

    expect(await flushTermsQueue()).toBe(1);
    expect(record).toHaveBeenCalledTimes(2);
    expect(await readQueue()).toEqual([]);
  });
});

describe('Terms page', () => {
  it('is reachable from Settings', async () => {
    await AsyncStorage.setItem(ACCEPTED_KEY, JSON.stringify({ acceptedAt: new Date().toISOString(), appVersion: '1.0.0', termsVersion: TERMS_VERSION }));
    await open('/profile/settings');
    await fireEvent.press(await screen.findByText('Terms of Service: Maps, Data and Your Responsibility'));
    expect(await screen.findByTestId('tos-maps-data')).toBeTruthy();
    expect(screen.getByTestId('tos-maps-data')).toHaveTextContent(tosSection[1].body, { exact: false });
  });
});
