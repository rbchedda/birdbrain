/**
 * Option A end-to-end verification (flag ON): one assertion per counsel condition
 * not already covered by noticeDismiss.test.tsx / consentOptionA.test.tsx.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import { MAP_BANNER, PEEK_SURVEY_LINE } from '@/data/mapNotice';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
jest.spyOn(backend, 'getSession').mockResolvedValue(null);
jest.spyOn(backend, 'onSessionChange').mockImplementation(() => () => {});
jest.spyOn(backend, 'recordNoticeDismissal').mockResolvedValue(undefined);

const FLAG = 'EXPO_PUBLIC_FLAG_NOTICE_DISMISS';
beforeEach(async () => {
  await AsyncStorage.clear();
  process.env[FLAG] = '1';
});
afterEach(() => {
  delete process.env[FLAG];
});

describe('Option A verification (flag ON)', () => {
  it('(3) the (i) is rendered before and after dismissal; modal has full text, View data sources, Show on map, Got it', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByText('6 spots nearby');
    expect(screen.getByLabelText('Boundary notice')).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Hide boundary notice'));
    await waitFor(() => expect(screen.queryByTestId('map-banner')).toBeNull());
    expect(screen.getByLabelText('Boundary notice')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Boundary notice'));
    expect(screen.getByTestId('map-full-notice')).toHaveTextContent(MAP_BANNER, { exact: false });
    expect(screen.getByText(/View data sources/)).toBeTruthy();
    expect(screen.getByText('Show on map')).toBeTruthy();
    expect(screen.getByText('Got it')).toBeTruthy();
  });

  it('(7) peek line wording is verbatim on the same line as the check heading', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByText('6 spots nearby');
    const handle = await screen.findByLabelText(/^(Expand|Collapse) details$/);
    if (handle.props.accessibilityLabel === 'Expand details') await fireEvent.press(handle);
    await fireEvent.press(await screen.findByLabelText('State Game Lands (sample A)'));
    expect(await screen.findByTestId('place-check-line')).toHaveTextContent(`Check before you hunt · ${PEEK_SURVEY_LINE}`);
    expect(PEEK_SURVEY_LINE).toBe('Boundaries approximate, not a survey. Permission required on private land.');
  });

  it('(6) Data Sources and Terms screens carry the full notice verbatim', async () => {
    await renderRouter('./src/app', { initialUrl: '/data-sources' });
    expect(await screen.findByText(MAP_BANNER)).toBeTruthy();
    screen.unmount();
    await renderRouter('./src/app', { initialUrl: '/terms' });
    expect(await screen.findByTestId('terms-map-notice')).toHaveTextContent(MAP_BANNER, { exact: false });
  });
});
