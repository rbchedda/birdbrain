import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
import { MAP_BANNER, MAP_BANNER_SHORT, NOTICE_VERSION, PEEK_SURVEY_LINE } from '@/data/mapNotice';
import { NOTICE_DISMISS_KEY, dismissNoticeFor, isNoticeDismissed, restoreNoticeFor } from '@/lib/noticeDismiss';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

// One session store per module: drive it through onSessionChange.
let emit: (s: Session | null) => void = () => {};
jest.spyOn(backend, 'getSession').mockResolvedValue(null);
jest.spyOn(backend, 'onSessionChange').mockImplementation((cb) => {
  emit = cb;
  return () => {};
});
const record = jest.spyOn(backend, 'recordNoticeDismissal').mockResolvedValue(undefined);
const me: Session = { userId: 'u1', email: 'a@example.test' };
const setSession = (s: Session | null) => act(() => emit(s));

async function open() {
  await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findByText('6 spots nearby');
}
async function openPlace() {
  const handle = await screen.findByLabelText(/^(Expand|Collapse) details$/);
  if (handle.props.accessibilityLabel === 'Expand details') await fireEvent.press(handle);
  await fireEvent.press(await screen.findByLabelText('State Game Lands (sample A)'));
}
const FLAG = 'EXPO_PUBLIC_FLAG_NOTICE_DISMISS';

beforeEach(async () => {
  await AsyncStorage.clear();
  record.mockClear().mockResolvedValue(undefined);
});
afterEach(() => {
  delete process.env[FLAG];
});
afterAll(() => AsyncStorage.clear());

describe('flag OFF (default): notice is exactly as before', () => {
  it('no close, no (i), "Got it" only collapses, nothing logged or stored, no extra peek line', async () => {
    await open();
    await setSession(me);
    expect(screen.queryByTestId('map-banner-dismiss')).toBeNull();
    expect(screen.queryByTestId('map-notice-info')).toBeNull();
    await fireEvent.press(screen.getByTestId('map-banner'));
    await fireEvent.press(screen.getByText('Got it'));
    expect(screen.queryByTestId('map-full-notice')).toBeNull();
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);
    expect(record).not.toHaveBeenCalled();
    expect((await AsyncStorage.getAllKeys()).filter((k) => /banner|notice/i.test(k))).toEqual([]);
    expect(await dismissNoticeFor('u1')).toBe(false);
    await openPlace();
    expect(screen.getByTestId('place-notice')).not.toHaveTextContent(PEEK_SURVEY_LINE, { exact: false });
    await setSession(null);
  });
});

describe('flag ON: lawyer conditions', () => {
  beforeEach(() => {
    process.env[FLAG] = '1';
  });

  it('(3)(4) signed out: banner stays, no close control, "Got it" only collapses, (i) always there', async () => {
    await open();
    await setSession(null);
    expect(screen.queryByTestId('map-banner-dismiss')).toBeNull();
    await fireEvent.press(screen.getByTestId('map-notice-info'));
    expect(screen.getByTestId('map-full-notice')).toHaveTextContent(MAP_BANNER, { exact: false });
    await fireEvent.press(screen.getByText('Got it'));
    expect(screen.queryByTestId('map-full-notice')).toBeNull();
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT);
    expect(record).not.toHaveBeenCalled();
    expect(await dismissNoticeFor(null)).toBe(false);
  });

  it('(1)(2) only the close button / "Got it" dismiss; each is logged with notice + app version; (4) (i) reopens', async () => {
    await open();
    await setSession(me);
    const closeBtn = await screen.findByTestId('map-banner-dismiss');
    // Opening/collapsing and other taps never dismiss.
    await fireEvent.press(screen.getByTestId('map-banner'));
    await fireEvent.press(screen.getByTestId('map-banner'));
    await fireEvent.press(screen.getByLabelText('Map layers'));
    expect(screen.getByTestId('map-banner')).toBeTruthy();
    expect(record).not.toHaveBeenCalled();

    await fireEvent.press(closeBtn);
    await waitFor(() => expect(screen.queryByTestId('map-banner')).toBeNull());
    expect(record).toHaveBeenCalledWith({ noticeVersion: NOTICE_VERSION, appVersion: expect.any(String), method: 'close' });
    expect(JSON.parse((await AsyncStorage.getItem(NOTICE_DISMISS_KEY))!)).toEqual({ u1: NOTICE_VERSION });
    await fireEvent.press(screen.getByTestId('map-notice-info'));
    expect(screen.getByTestId('map-full-notice')).toHaveTextContent(MAP_BANNER, { exact: false });
    // "Show on map" brings the banner back and clears the dismissal.
    await fireEvent.press(screen.getByText('Show on map'));
    await waitFor(() => expect(screen.getByTestId('map-banner')).toBeTruthy());
    expect(screen.getByTestId('map-notice-info')).toBeTruthy();
    await setSession(null);
    // Signing out brings the banner back.
    await waitFor(() => expect(screen.getByTestId('map-banner')).toBeTruthy());
  });

  it('"Got it" dismisses for a signed-in account', async () => {
    await open();
    await setSession(me);
    await fireEvent.press(await screen.findByTestId('map-banner'));
    await fireEvent.press(screen.getByText('Got it'));
    await waitFor(() => expect(screen.queryByTestId('map-banner')).toBeNull());
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ method: 'got_it' }));
    await setSession(null);
  });

  it('(2) if the log write fails, nothing is dismissed', async () => {
    record.mockRejectedValueOnce(new Error('offline'));
    expect(await dismissNoticeFor('u1')).toBe(false);
    expect(await isNoticeDismissed('u1')).toBe(false);
    expect(await AsyncStorage.getItem(NOTICE_DISMISS_KEY)).toBeNull();
  });

  it('(5) a new NOTICE_VERSION brings the banner back; dismissals are per account', async () => {
    expect(await dismissNoticeFor('u1', 'v-old')).toBe(true);
    expect(await isNoticeDismissed('u1', 'v-old')).toBe(true);
    expect(await isNoticeDismissed('u1', 'v-new')).toBe(false);
    expect(await isNoticeDismissed('u2', 'v-old')).toBe(false);
    expect(await isNoticeDismissed(null, 'v-old')).toBe(false);
  });

  it('"Show on map" clears the stored dismissal', async () => {
    expect(await dismissNoticeFor('u1')).toBe(true);
    await restoreNoticeFor('u1');
    expect(await isNoticeDismissed('u1')).toBe(false);
  });

  it('(5) after a version bump the banner returns labeled "UPDATED NOTICE"', async () => {
    await AsyncStorage.setItem(NOTICE_DISMISS_KEY, JSON.stringify({ u1: 'v-old' }));
    await open();
    await setSession(me);
    await waitFor(() => expect(screen.getByTestId('map-notice-updated')).toHaveTextContent('UPDATED NOTICE'));
    expect(screen.getByTestId('map-banner')).toHaveTextContent(MAP_BANNER_SHORT, { exact: false });
    await setSession(null);
  });

  it('(6)(7) place sheet keeps the full notice; the "Check before you hunt" line carries the survey line', async () => {
    await open();
    await openPlace();
    expect(await screen.findByTestId('place-map-banner')).toHaveTextContent(MAP_BANNER);
    expect(screen.getByTestId('place-notice')).toHaveTextContent(
      'Check before you hunt. Boundaries approximate, not a survey. Permission required on private land. Boundaries and locations come from',
      { exact: false },
    );
  });
});
