import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { samplePlans } from '@/data/sampleBackend';
import { resetSignal } from '@/lib/connectivity';

// Pinned inside 2027-28, which is deliberately NOT in the SEASONS registry (unpublished).
const FIXED_NOW = new Date('2027-09-15T16:00:00Z');
const REAL_TIMERS = ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'] as const;
beforeAll(() => jest.useFakeTimers({ now: FIXED_NOW, doNotFake: [...REAL_TIMERS] }));
afterAll(() => jest.useRealTimers());

const LINE = '2027-28 dates not published yet. Check the PGC hunting digest.';
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

beforeEach(async () => {
  await AsyncStorage.clear();
  samplePlans.clear();
  resetSignal();
});

async function openSpot(label: string) {
  await renderRouter('./src/app', { initialUrl: '/' });
  const handle = await screen.findByLabelText(/^(Expand|Collapse) details$/);
  if (handle.props.accessibilityLabel === 'Expand details') await fireEvent.press(handle);
  await fireEvent.press(await screen.findByLabelText(label));
}

it('spot sheet: unpublished line, no Closed/Out of season, no legal hours in Today row, no migratory claim', async () => {
  await openSpot('Managed dove field (sample C)');
  expect(await screen.findByTestId('today-row')).toHaveTextContent(`Today: season dates not published${LINE}`);
  expect(screen.getByText(/Season dates not published ·/)).toBeTruthy();
  expect(screen.getByTestId('season-unpublished-line')).toHaveTextContent(LINE);
  expect(screen.queryByText(/Out of season|No season open today/)).toBeNull();
  expect(screen.queryByText('Migratory birds')).toBeNull();
  expect(screen.queryByText(/^Closed$/)).toBeNull();
});

it('What to hunt: last-season ranges with years and Dates not published tags', async () => {
  await openSpot('Managed dove field (sample C)');
  await fireEvent.press(await screen.findByTestId('tile-hunt'));
  expect(await screen.findByText(/2026-27 \(last season\): Sep 1, 2026 – Nov 27, 2026/)).toBeTruthy();
  expect(screen.queryAllByText('Closed')).toHaveLength(0);
  expect(screen.getAllByText('Dates not published').length).toBeGreaterThan(0);
  expect(screen.getByText(/Season dates shown: PGC 2026-27 \(last season\) digest\./)).toBeTruthy();
});

it('Plan: species selectable, unverified note, Next enabled', async () => {
  await openSpot('Pheasant stocking (sample B)');
  await fireEvent.press(await screen.findByTestId('tile-plan'));
  expect(await screen.findByTestId('plan-unverified')).toHaveTextContent(`Unverified dates. ${LINE}`);
  expect(screen.queryByTestId('nothing-open')).toBeNull();
  await fireEvent.press(screen.getByTestId('species-pheasant'));
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByRole('button', { name: 'Save plan' })).toBeTruthy();
});

it('Guide bird page: notice and last-season label', async () => {
  await renderRouter('./src/app', { initialUrl: '/guide/bird/dove' });
  expect(await screen.findByTestId('season-unpublished')).toHaveTextContent(`Rules shown are from 2026-27 (last season). ${LINE}`, { exact: false });
  expect(screen.getByTestId('bird-seasons')).toHaveTextContent(/2026-27 \(last season\)Mourning dove: Tue, Sep 1, 2026 – Fri, Nov 27, 2026/);
});
