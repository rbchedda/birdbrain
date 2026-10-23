import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { NOTICE_CONSENT_LABEL } from '@/components/OnboardingConsent';
import { backend } from '@/data';
import { MAP_BANNER, NOTICE_VERSION } from '@/data/mapNotice';
import { consentCheckboxLabel, TERMS_VERSION } from '@/data/terms';
import { needsConsent, readQueue, resetTermsConsentCache } from '@/lib/termsConsent';

jest.unmock('@/components/ConsentGate');
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
const FLAG = 'EXPO_PUBLIC_FLAG_NOTICE_DISMISS';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetTermsConsentCache();
  jest.restoreAllMocks();
  process.env[FLAG] = '1';
});
afterEach(() => {
  delete process.env[FLAG];
});
afterAll(() => AsyncStorage.clear());

describe('Option A onboarding consent (flag on)', () => {
  it('(1) full notice verbatim + Data sources; both boxes gate "I agree, continue"; logged with notice version + platform', async () => {
    jest.spyOn(backend, 'getSession').mockResolvedValue({ userId: 'me', email: null, anonymous: false });
    const record = jest.spyOn(backend, 'recordTermsAcceptance').mockResolvedValue(undefined);
    await renderRouter('./src/app', { initialUrl: '/' });
    const notice = await screen.findByTestId('consent-map-notice');
    expect(notice).toHaveTextContent(MAP_BANNER, { exact: false });
    await fireEvent.press(screen.getByText('View data sources ›'));
    expect(screen.getByTestId('consent-data-sources')).toBeTruthy();
    expect(screen.getByText('Read the Terms of Service')).toBeTruthy();

    const btn = () => screen.getByRole('button', { name: 'I agree, continue' });
    expect(btn()).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: consentCheckboxLabel }));
    expect(btn()).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: NOTICE_CONSENT_LABEL }));
    expect(btn()).toBeEnabled();
    await fireEvent.press(btn());
    expect(await screen.findByText('6 spots nearby')).toBeTruthy();
    await waitFor(() =>
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ termsVersion: TERMS_VERSION, noticeVersion: NOTICE_VERSION, platform: expect.any(String) }),
      ),
    );
  });

  it('(1) offline: consent is queued, the map opens anyway', async () => {
    jest.spyOn(backend, 'getSession').mockResolvedValue({ userId: 'me', email: null, anonymous: false });
    jest.spyOn(backend, 'recordTermsAcceptance').mockRejectedValue(new Error('offline'));
    await renderRouter('./src/app', { initialUrl: '/' });
    await fireEvent.press(await screen.findByRole('checkbox', { name: consentCheckboxLabel }));
    await fireEvent.press(screen.getByRole('checkbox', { name: NOTICE_CONSENT_LABEL }));
    await fireEvent.press(screen.getByRole('button', { name: 'I agree, continue' }));
    expect(await screen.findByText('6 spots nearby')).toBeTruthy();
    expect((await readQueue())[0]).toMatchObject({ noticeVersion: NOTICE_VERSION });
  });

  it('(4) a notice version bump asks for consent again; flag off ignores the notice version', () => {
    const old = { acceptedAt: 'x', appVersion: '1', termsVersion: TERMS_VERSION, noticeVersion: 'older' };
    expect(needsConsent(old)).toBe(true);
    expect(needsConsent({ ...old, noticeVersion: NOTICE_VERSION })).toBe(false);
    delete process.env[FLAG];
    expect(needsConsent(old)).toBe(false);
    expect(needsConsent({ acceptedAt: 'x', appVersion: '1', termsVersion: TERMS_VERSION })).toBe(false);
  });
});
