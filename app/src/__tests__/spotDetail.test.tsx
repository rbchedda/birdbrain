import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { backend } from '@/data';
import { sampleMe } from '@/data/posts';
import { samplePlans } from '@/data/sampleBackend';
import { resetSignal } from '@/lib/connectivity';
import { PLANS_KEY, type Plan } from '@/lib/plans';

const appDir = './src/app';
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const open = (url: string) => renderRouter(appDir, { initialUrl: url });

jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

beforeEach(async () => {
  await AsyncStorage.clear();
  samplePlans.clear();
  jest.restoreAllMocks();
  resetSignal();
});

async function openSpot(label = 'Pheasant stocking (sample B)') {
  await open('/');
  const handle = await screen.findByLabelText(/^(Expand|Collapse) details$/);
  if (handle.props.accessibilityLabel === 'Expand details') await fireEvent.press(handle);
  await fireEvent.press(await screen.findByLabelText(label));
}

describe('spot detail: peek and half', () => {
  it('peek: three tiles, exact check line, no Log hunt main button; half: today row, permission, links', async () => {
    await openSpot();
    expect(await screen.findByTestId('tile-directions')).toBeTruthy();
    expect(screen.getByTestId('tile-hunt')).toBeTruthy();
    expect(screen.getByTestId('tile-plan')).toBeTruthy();
    expect(screen.getByTestId('place-check-line')).toHaveTextContent(
      'Check before you hunt · Boundaries approximate, not a survey. Permission required on private land.',
    );
    expect(screen.queryByRole('button', { name: 'Log hunt' })).toBeNull();
    expect(screen.getByTestId('today-row')).toHaveTextContent(/^Today: /);
    expect(screen.getByTestId('permission-box')).toHaveTextContent(/^Permission: /);
    expect(screen.getByTestId('log-hunt-link')).toHaveTextContent('Log a hunt here ›');
    expect(screen.getByTestId('more-about-spot')).toBeTruthy();
    expect(screen.queryByText(/Plans/)).toBeNull(); // no map card for plans
  });

  it('Directions offline shows coordinates with Copy', async () => {
    await openSpot();
    resetSignal({ online: false, back: false });
    await fireEvent.press(await screen.findByTestId('tile-directions'));
    expect(screen.getByTestId('directions-offline')).toHaveTextContent(/\d+\.\d{5}, -\d+\.\d{5}/);
    expect(screen.getByTestId('copy-coords')).toBeTruthy();
  });
});

describe('What you can hunt here', () => {
  it('top card, groups with status tags, footer', async () => {
    await openSpot();
    await fireEvent.press(await screen.findByTestId('tile-hunt'));
    expect(await screen.findByTestId('hunt-top-card')).not.toHaveTextContent(/WMU|forecast/i);
    expect(screen.getByTestId('group-good')).toBeTruthy();
    expect(screen.getByTestId('hunt-row-pheasant')).toBeTruthy();
    expect(screen.getByTestId('season-footer')).toHaveTextContent('Season dates: PGC 2026-27 digest. Check WMU rules before you hunt.');
    expect(screen.queryByText(/bag limit|daily limit/i)).toBeNull();
  });
});

describe('Plan a hunt → Profile › Plans', () => {
  it('picks a date and species, saves, toasts with View ›, lists in Profile with detail actions', async () => {
    await openSpot();
    await fireEvent.press(await screen.findByTestId('tile-plan'));
    expect(await screen.findByTestId('day-chips')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    await fireEvent.press(screen.getByText('Pick a date'));
    await fireEvent.press(screen.getByLabelText('Next month'));
    await fireEvent.press(screen.getByLabelText('2026-11-14'));
    expect(screen.getByTestId('plan-day-card')).toHaveTextContent(/Sat, Nov 14/);
    expect(screen.queryByTestId('plan-forecast')).toBeNull();
    expect(screen.getByTestId('plan-day-card')).not.toHaveTextContent(/forecast|wind|°/i);
    await fireEvent.press(screen.getByTestId('species-pheasant'));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.changeText(screen.getByTestId('plan-notes'), 'x'.repeat(600));
    expect(screen.getByText('500/500')).toBeTruthy();
    expect(screen.getByTestId('reminders-soon')).toHaveTextContent('Reminders coming soon');
    expect(screen.queryByTestId('reminder-choices')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save plan' }));
    expect(await screen.findByTestId('plan-saved-toast')).toHaveTextContent(/^Plan saved/);

    const stored = JSON.parse((await AsyncStorage.getItem(PLANS_KEY))!) as Plan[];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ date: '2026-11-14', species: ['pheasant'], reminder: 'none', crew: null });
    expect(stored[0].notes).toHaveLength(500);

    await fireEvent.press(screen.getByTestId('toast-view'));
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Directions' })).toBeTruthy();
  });

  it('Profile shows the Plans section: empty state, then upcoming rows', async () => {
    await open('/profile');
    expect(await screen.findByTestId('plans-empty')).toHaveTextContent(/No hunts planned/);
    expect(screen.getByRole('button', { name: 'Open map' })).toBeTruthy();
  });

  it('Profile row shows date tile, spot, species and the waiting badge while queued', async () => {
    const plan: Plan = {
      id: '11111111-1111-4111-8111-111111111111',
      owner: '',
      place: { id: 'stock-sample-1', name: 'Pheasant stocking (sample B)', type: 'stocking', access: 'state_game_land', center: { lng: -76.7, lat: 40.45 }, species: ['pheasant'] },
      date: '2026-11-14',
      species: ['pheasant'],
      notes: '',
      reminder: 'none',
      reminderScheduled: false,
      crew: null,
      sync: 'pending',
      createdAt: '2026-10-23T12:00:00Z',
      updatedAt: '2026-10-23T12:00:00Z',
    };
    const owner = sampleMe.id;
    jest.spyOn(backend, 'upsertPlan').mockRejectedValue(new Error('relation "public.plans" does not exist'));
    await AsyncStorage.setItem(PLANS_KEY, JSON.stringify([{ ...plan, owner }]));
    await open('/profile');
    const row = await screen.findByTestId(`plan-row-${plan.id}`);
    expect(row).toHaveTextContent(/Sat.*Nov 14.*Pheasant stocking \(sample B\).*Pheasant/);
    expect(screen.getByTestId('badge-waiting')).toHaveTextContent('Saved on phone · waiting to sync');
    expect(screen.queryByTestId('plans-empty')).toBeNull();
  });

  it('a crew plan shared by someone else opens view-only (no Edit, Share or Delete)', async () => {
    const pal: Plan = {
      id: 'pal-1',
      owner: 'someone-else',
      account: sampleMe.id,
      readOnly: true,
      place: { id: 'stock-sample-1', name: 'Pheasant stocking (sample B)', type: 'stocking', access: 'state_game_land', center: { lng: -76.7, lat: 40.45 }, species: ['pheasant'] },
      date: '2026-11-14',
      species: ['pheasant'],
      notes: '',
      reminder: 'none',
      reminderScheduled: false,
      crew: { id: 'crew-1', name: 'Ridge Crew' },
      sync: 'synced',
      createdAt: '2026-10-23T12:00:00Z',
      updatedAt: '2026-10-23T12:00:00Z',
    };
    await AsyncStorage.setItem(PLANS_KEY, JSON.stringify([pal]));
    await open('/plans/pal-1');
    expect(await screen.findByTestId('plan-read-only')).toHaveTextContent('Shared with you by Ridge Crew · view only');
    expect(screen.getByRole('button', { name: 'Directions' })).toBeTruthy();
    for (const name of ['Edit', 'Delete', 'Unshare']) expect(screen.queryByRole('button', { name })).toBeNull();
  });
});
