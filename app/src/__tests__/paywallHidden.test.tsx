import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import { renderRouter, screen as routerScreen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import {
  canUse,
  createPurchaseProvider,
  EntitlementsProvider,
  FREE_STATE,
  Gated,
  PREMIUM_FEATURES,
  UpgradeSheet,
  useEntitlements,
  type PurchaseProvider,
} from '@/entitlements';
import { StockingList } from '@/components/StockingList';
import { samplePlaces } from '@/data/places';
import { flags } from '@/lib/flags';

// v1 (RBChedda, Nov 17 2026): launch free with the paywall hidden. The flag is OFF by default.
const PAYWALL_COPY = /Season Pass|Weekend Pass|See passes|Upgrade BirdBrain|Passes coming soon|needs a pass|Restore purchases|\bPro\b|subscription/;

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_FLAG_PAYWALL;
  return AsyncStorage.clear();
});

describe('paywall hidden for v1 (EXPO_PUBLIC_FLAG_PAYWALL unset)', () => {
  it('is off by default', () => {
    expect(flags.paywall).toBe(false);
  });

  it('unlocks every premium feature for free', () => {
    for (const f of PREMIUM_FEATURES) expect(canUse(f, FREE_STATE)).toBe(true);
  });

  it('never creates a purchase provider (RevenueCat is not loaded, no mock store)', () => {
    const load = jest.fn(() => ({ name: 'revenuecat' }) as PurchaseProvider);
    expect(createPurchaseProvider({ flag: 'revenuecat', isDev: false, loadRevenueCat: load }).name).toBe('unavailable');
    expect(createPurchaseProvider({ flag: 'mock', isDev: true }).name).toBe('unavailable');
    expect(load).not.toHaveBeenCalled();
  });

  it('Gated shows the feature, and the upgrade sheet never renders even if asked', async () => {
    let show: (f: 'offlineMaps' | null) => void = () => {};
    const Probe = () => {
      show = useEntitlements().showUpgrade;
      return null;
    };
    await render(
      <EntitlementsProvider>
        <Gated feature="offlineMaps"><Text>maps-content</Text></Gated>
        <Probe />
        <UpgradeSheet />
      </EntitlementsProvider>,
    );
    expect(screen.getByText('maps-content')).toBeTruthy();
    await act(async () => show('offlineMaps'));
    expect(screen.queryByTestId('upgrade-sheet')).toBeNull();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(PAYWALL_COPY);
  });

  it('stocking list shows the full calendar with no pass copy', async () => {
    await render(<StockingList places={samplePlaces} savedIds={[]} now={new Date('2026-10-01T16:00:00Z')} onPick={() => {}} />);
    expect(screen.queryByTestId('gated-stockingCalendar')).toBeNull();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(PAYWALL_COPY);
  });

  it.each(['/offline-maps', '/profile/settings', '/profile/stats', '/profile'])('%s shows no paywall entry point or pass copy', async (url) => {
    await renderRouter('./src/app', { initialUrl: url });
    await act(async () => {});
    expect(routerScreen.queryByTestId('upgrade-sheet')).toBeNull();
    expect(routerScreen.queryByTestId(/^gated-/)).toBeNull();
    const tree = JSON.stringify(routerScreen.toJSON());
    expect(tree.length).toBeGreaterThan(1000); // the screen really rendered
    expect(tree).not.toMatch(PAYWALL_COPY);
  });
});
