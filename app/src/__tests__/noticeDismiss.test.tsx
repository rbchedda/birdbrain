import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import type { Session } from '@/data/backend';
import { MAP_BANNER, MAP_BANNER_SHORT, NOTICE_VERSION, PEEK_SURVEY_LINE } from '@/data/mapNotice';
import {
  DEVICE,
  NOTICE_QUEUE_KEY,
  dismissNoticeFor,
  flushNoticeQueue,
  isNoticeDismissed,
  noticeUpdatedFor,
  resetNoticeCache,
  syncNoticeOnSignIn,
} from '@/lib/noticeDismiss';

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

describe('flag ON: Option A (HANDOFF §2)', () => {
  beforeEach(() => {
    process.env[FLAG] = '1';
    resetNoticeCache();
  });
  const queue = async () => JSON.parse((await AsyncStorage.getItem(NOTICE_QUEUE_KEY)) ?? '[]');

  it('(2) only close / "Got it" dismiss; each is logged with method, versions, platform and device time', async () => {
    jest.spyOn(backend, 'getSession').mockResolvedValue(me);
    await open();
    await setSession(me);
    // Opening/collapsing and other taps never dismiss.
    await fireEvent.press(screen.getByTestId('map-banner'));
    await fireEvent.press(screen.getByTestId('map-banner'));
    await fireEvent.press(screen.getByLabelText('Map layers'));
    expect(screen.getByTestId('map-banner')).toBeTruthy();
    expect(record).not.toHaveBeenCalled();

    await fireEvent.press(await screen.findByLabelText('Hide boundary notice'));
    await waitFor(() => expect(screen.queryByTestId('map-banner')).toBeNull());
    await waitFor(() =>
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'notice_dismiss',
          method: 'close',
          noticeVersion: NOTICE_VERSION,
          appVersion: expect.any(String),
          platform: expect.any(String),
          at: expect.any(String),
          clientId: expect.any(String),
        }),
      ),
    );
    // (3) the (i) is always there and reopens the full notice; "Show on map" restores and logs.
    await fireEvent.press(screen.getByLabelText('Boundary notice'));
    expect(screen.getByTestId('map-full-notice')).toHaveTextContent(MAP_BANNER, { exact: false });
    await fireEvent.press(screen.getByText('Show on map'));
    await waitFor(() => expect(screen.getByTestId('map-banner')).toBeTruthy());
    await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'notice_restore', method: 'show_on_map' })));

    await fireEvent.press(screen.getByTestId('map-banner'));
    await fireEvent.press(screen.getByText('Got it'));
    await waitFor(() => expect(screen.queryByTestId('map-banner')).toBeNull());
    await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ method: 'got_it' })));
    jest.spyOn(backend, 'getSession').mockResolvedValue(null);
    await setSession(null);
  });

  it('(2) offline: dismissal hides at once, stays queued, and is sent later', async () => {
    record.mockRejectedValue(new Error('offline'));
    jest.spyOn(backend, 'getSession').mockResolvedValue(me);
    expect(await dismissNoticeFor('u1', NOTICE_VERSION, 'close')).toBe(true);
    expect(await isNoticeDismissed('u1')).toBe(true);
    await flushNoticeQueue();
    expect(await queue()).toHaveLength(1);
    record.mockResolvedValue(undefined);
    expect(await flushNoticeQueue()).toBe(1);
    expect(await queue()).toEqual([]);
    jest.spyOn(backend, 'getSession').mockResolvedValue(null);
  });

  it('(2) signed out: kept on the phone, uploaded under the account at sign-in', async () => {
    await open();
    await setSession(null);
    await fireEvent.press(await screen.findByLabelText('Hide boundary notice'));
    await waitFor(() => expect(screen.queryByTestId('map-banner')).toBeNull());
    expect(record).not.toHaveBeenCalled();
    expect((await queue())[0]).toMatchObject({ owner: DEVICE, method: 'close' });
    jest.spyOn(backend, 'getSession').mockResolvedValue(me);
    await syncNoticeOnSignIn('u1');
    expect(record).toHaveBeenCalledTimes(1);
    expect(await isNoticeDismissed('u1')).toBe(true);
    expect(await queue()).toEqual([]);
    jest.spyOn(backend, 'getSession').mockResolvedValue(null);
  });

  it('(2) cross-device: the account\'s server state is applied at sign-in', async () => {
    jest.spyOn(backend, 'getSession').mockResolvedValue(me);
    const latest = jest.spyOn(backend, 'latestNoticeAction').mockResolvedValue('notice_dismiss');
    await syncNoticeOnSignIn('u1');
    expect(await isNoticeDismissed('u1')).toBe(true);
    latest.mockResolvedValue('notice_restore');
    await syncNoticeOnSignIn('u1');
    expect(await isNoticeDismissed('u1')).toBe(false);
    latest.mockRejectedValue(new Error('offline')); // offline: phone keeps its state
    await dismissNoticeFor('u1');
    record.mockRejectedValue(new Error('offline'));
    await syncNoticeOnSignIn('u1');
    expect(await isNoticeDismissed('u1')).toBe(true);
    latest.mockRestore();
    jest.spyOn(backend, 'getSession').mockResolvedValue(null);
  });

  it('(4) a NOTICE_VERSION bump brings the banner back labeled "UPDATED NOTICE"', async () => {
    expect(await dismissNoticeFor('u1', 'v-old')).toBe(true);
    expect(await isNoticeDismissed('u1', 'v-new')).toBe(false);
    expect(await noticeUpdatedFor('u1', 'v-new')).toBe(true);
    expect(await noticeUpdatedFor('u2', 'v-new')).toBe(false);
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
