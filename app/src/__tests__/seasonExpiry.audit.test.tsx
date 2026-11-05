/**
 * Season-expiry audit harness (opt-in). Renders the real screens with sample data at faked dates and
 * writes each screen's visible text to $SEASON_AUDIT_DIR/<date>/<screen>.txt. Skipped unless
 * SEASON_AUDIT_DIR is set, so it never runs in the normal suite.
 *
 *   SEASON_AUDIT_DIR=/tmp/season-audit SEASON_AUDIT_DATES=2026-11-05,2027-07-01,2027-09-15 \
 *     npx jest seasonExpiry.audit
 */
import fs from 'node:fs';
import path from 'node:path';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { samplePlans } from '@/data/sampleBackend';
import { resetSignal } from '@/lib/connectivity';

const DIR = process.env.SEASON_AUDIT_DIR;
const DATES: string[] = (process.env.SEASON_AUDIT_DATES ?? '2026-11-05,2027-07-01,2027-09-15').split(',');
const REAL_TIMERS = ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'] as const;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

/** Flatten the rendered tree's text, one host Text per line. */
function textOf(node: unknown): string {
  const out: string[] = [];
  const walk = (n: any): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'Text') {
      const t: string[] = [];
      const flat = (c: any): void => (c == null ? undefined : typeof c === 'string' ? void t.push(c) : Array.isArray(c) ? c.forEach(flat) : flat(c.children));
      flat(n.children);
      return void out.push(t.join(''));
    }
    walk(n.children);
  };
  walk(node);
  return out.filter((l) => l.trim()).join('\n');
}

const open = (url: string) => renderRouter('./src/app', { initialUrl: url });
async function openSpot(label: string) {
  await open('/');
  const handle = await screen.findByLabelText(/^(Expand|Collapse) details$/);
  if (handle.props.accessibilityLabel === 'Expand details') await fireEvent.press(handle);
  await fireEvent.press(await screen.findByLabelText(label));
}

const STEPS: [string, () => Promise<void>][] = [
  ['spot-dove', () => openSpot('Managed dove field (sample C)')],
  ['spot-pheasant', () => openSpot('Pheasant stocking (sample B)')],
  ['what-to-hunt', async () => { await openSpot('Pheasant stocking (sample B)'); await fireEvent.press(await screen.findByTestId('tile-hunt')); }],
  ['plan', async () => { await openSpot('Pheasant stocking (sample B)'); await fireEvent.press(await screen.findByTestId('tile-plan')); await screen.findByTestId('day-chips').catch(() => {}); }],
  ['plan-grid', async () => { await openSpot('Pheasant stocking (sample B)'); await fireEvent.press(await screen.findByTestId('tile-plan')); await fireEvent.press(await screen.findByText('Pick a date')); }],
  ['guide', async () => { await open('/guide'); }],
  ['guide-hours', async () => { await open('/guide/hours'); }],
  ['guide-regs', async () => { await open('/guide/regs'); }],
  ['learn', async () => { await open('/learn'); }],
  ['guide-bird-dove', async () => { await open('/guide/bird/dove'); }],
  ['guide-bird-pheasant', async () => { await open('/guide/bird/pheasant'); }],
  ['guide-bird-turkey', async () => { await open('/guide/bird/turkey'); }],
  ['plan-screen', async () => { await open('/plan'); }],
  ['profile', async () => { await open('/profile'); }],
  ['profile-stats', async () => { await open('/profile/stats'); }],
];

const run = DIR ? describe : describe.skip;
for (const date of DATES) run(`season audit ${date}`, () => {
  beforeAll(() => jest.useFakeTimers({ now: new Date(`${date}T16:00:00Z`), doNotFake: [...REAL_TIMERS] }));
  afterAll(() => jest.useRealTimers());
  beforeEach(async () => {
    await AsyncStorage.clear();
    samplePlans.clear();
    resetSignal();
  });
  it.each(STEPS)('%s', async (name, step) => {
    const out = path.join(DIR!, date);
    fs.mkdirSync(out, { recursive: true });
    let text: string;
    try {
      await step();
      await act(async () => {});
      text = textOf(screen.toJSON());
    } catch (e) {
      text = `ERROR: ${String(e).slice(0, 2000)}\n---\n${(() => { try { return textOf(screen.toJSON()); } catch { return ''; } })()}`;
    }
    fs.writeFileSync(path.join(out, `${name}.txt`), text);
  });
});
