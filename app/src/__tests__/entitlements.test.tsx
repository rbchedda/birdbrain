import { fireEvent, render, screen } from '@testing-library/react-native';
declare const __dirname: string;
declare function require(name: 'fs'): { readdirSync(p: string): string[]; readFileSync(p: string, e: 'utf8'): string; statSync(p: string): { isDirectory(): boolean } };
declare function require(name: 'path'): { join(...p: string[]): string };
const { readFileSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

import {
  canUse,
  createPurchaseProvider,
  EntitlementsProvider,
  FREE_FEATURES,
  FREE_STATE,
  Gated,
  hasPremium,
  isPremium,
  MockPurchaseProvider,
  PREMIUM_FEATURES,
  PRODUCTS,
  providerFlag,
  SAFETY_FEATURES,
  UpgradeSheet,
  useEntitlements,
  type PurchaseProvider,
  UnavailablePurchaseProvider,
} from '@/entitlements';
import { Linking, Text } from 'react-native';

import { legal } from '@/lib/env';

import { StockingList } from '@/components/StockingList';
import { samplePlaces } from '@/data/places';

const NOW = Date.parse('2026-10-22T14:00:00Z');
const premium = { active: ['season_pass'], seasonPassExpiresAt: NOW + 1e9 };

describe('gating', () => {
  it('safety features are never gated, in any state', () => {
    for (const f of SAFETY_FEATURES) {
      expect(isPremium(f)).toBe(false);
      expect(canUse(f, FREE_STATE, NOW)).toBe(true);
      expect(canUse(f, { active: [], weekendPassExpiresAt: NOW - 1 }, NOW)).toBe(true);
      expect(PREMIUM_FEATURES as readonly string[]).not.toContain(f);
    }
  });
  it('free features are free; premium features need a pass', () => {
    for (const f of FREE_FEATURES) expect(canUse(f, FREE_STATE, NOW)).toBe(true);
    for (const f of PREMIUM_FEATURES) {
      expect(canUse(f, FREE_STATE, NOW)).toBe(false);
      expect(canUse(f, premium, NOW)).toBe(true);
    }
  });
  it('expired season pass is free tier', () => {
    expect(hasPremium({ active: ['season_pass'], seasonPassExpiresAt: NOW - 1 }, NOW)).toBe(false);
  });
  it('weekend pass grants premium until expiry, then lapses', async () => {
    let t = NOW;
    const p = new MockPurchaseProvider(() => t);
    const s = await p.purchase('weekend_pass');
    expect(canUse('offlineMaps', s, t)).toBe(true);
    t += 71 * 3600_000;
    expect(canUse('offlineMaps', s, t)).toBe(true);
    t += 2 * 3600_000;
    expect(canUse('offlineMaps', s, t)).toBe(false);
    expect(canUse('regs', s, t)).toBe(true);
  });
  it('mock season pass purchase grants season_pass entitlement', async () => {
    const s = await new MockPurchaseProvider(() => NOW).purchase('season_pass_yearly');
    expect(s.active).toContain('season_pass');
    expect(hasPremium(s, NOW)).toBe(true);
  });
});

describe('config', () => {
  it('all prices are placeholders flagged notFinal', () => {
    expect(PRODUCTS.season_pass_yearly.price.amountUsd).toBe(19.99);
    expect(PRODUCTS.season_pass_yearly.introOffer?.price.amountUsd).toBe(9.99);
    expect(PRODUCTS.weekend_pass.price.amountUsd).toBe(3.99);
    expect(PRODUCTS.weekend_pass.kind).toBe('non_renewing');
    expect(PRODUCTS.season_pass_yearly.kind).toBe('auto_renewing_yearly');
    for (const p of Object.values(PRODUCTS)) {
      expect(p.price.notFinal).toBe(true);
      if (p.introOffer) expect(p.introOffer.price.notFinal).toBe(true);
    }
  });
  it('no prices or product ids hard-coded outside config.ts, no Stripe', () => {
    const files: string[] = [];
    const walk = (d: string) =>
      readdirSync(d).forEach((n) => {
        const f = join(d, n);
        if (statSync(f).isDirectory()) { if (n !== '__tests__') walk(f); } else if (/\.tsx?$/.test(n)) files.push(f);
      });
    walk(join(__dirname, '..'));
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(/@stripe\/|stripe-react|stripe\.com|StripeProvider/i.test(src)).toBe(false);
      if (f.endsWith(join('entitlements', 'config.ts'))) continue;
      expect([f, /\$(19\.99|9\.99|3\.99)|PLACEHOLDER'/.test(src)]).toEqual([f, false]);
    }
  });
});

describe('provider selection', () => {
  it('defaults to mock; flag parsing', () => {
    expect(providerFlag(undefined)).toBe('mock');
    expect(providerFlag('')).toBe('mock');
    expect(providerFlag('stripe')).toBe('mock');
    expect(providerFlag(' RevenueCat ')).toBe('revenuecat');
    expect(createPurchaseProvider({ flag: undefined }).name).toBe('mock');
  });
  it('does not load RevenueCat unless flagged', () => {
    const load = jest.fn();
    expect(createPurchaseProvider({ flag: 'mock', loadRevenueCat: load }).name).toBe('mock');
    expect(load).not.toHaveBeenCalled();
  });
  it('uses RevenueCat when flagged and loadable', () => {
    const rc = { name: 'revenuecat' } as PurchaseProvider;
    expect(createPurchaseProvider({ flag: 'revenuecat', loadRevenueCat: () => rc })).toBe(rc);
  });
  it('falls back to mock when RevenueCat fails to load (Expo Go / no key)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(createPurchaseProvider({ flag: 'revenuecat', loadRevenueCat: () => { throw new Error('no native module'); } }).name).toBe('mock');
    // Real loader: no API key in tests -> throws -> mock.
    expect(createPurchaseProvider({ flag: 'revenuecat' }).name).toBe('mock');
    warn.mockRestore();
  });
});

describe('release builds never use the mock store', () => {
  it('dev build: mock when unflagged or RevenueCat fails', () => {
    expect(createPurchaseProvider({ flag: undefined, isDev: true }).name).toBe('mock');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(createPurchaseProvider({ flag: 'revenuecat', isDev: true, loadRevenueCat: () => { throw new Error('x'); } }).name).toBe('mock');
    warn.mockRestore();
  });
  it('release build: unavailable (never mock) when unflagged or RevenueCat fails', async () => {
    expect(createPurchaseProvider({ flag: undefined, isDev: false }).name).toBe('unavailable');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const p = createPurchaseProvider({ flag: 'revenuecat', isDev: false, loadRevenueCat: () => { throw new Error('x'); } });
    warn.mockRestore();
    expect(p.name).toBe('unavailable');
    await expect(p.purchase('season_pass_yearly')).rejects.toThrow();
    expect(hasPremium(await p.getEntitlements(), NOW)).toBe(false);
  });
  it('release build with working RevenueCat uses it', () => {
    const rc = { name: 'revenuecat' } as PurchaseProvider;
    expect(createPurchaseProvider({ flag: 'revenuecat', isDev: false, loadRevenueCat: () => rc })).toBe(rc);
  });
  it('release sheet: premium locked, buy buttons hidden, "Passes coming soon"', async () => {
    await render(
      <EntitlementsProvider provider={new UnavailablePurchaseProvider()}>
        <Gated feature="offlineMaps"><Text>maps-content</Text></Gated>
        <UpgradeSheet />
      </EntitlementsProvider>,
    );
    await fireEvent.press(screen.getByText('See passes'));
    expect(await screen.findByTestId('passes-coming-soon')).toBeTruthy();
    expect(screen.queryByText(/^Get /)).toBeNull();
    expect(screen.queryByText('Restore purchases')).toBeNull();
    expect(screen.queryByText('maps-content')).toBeNull();
  });
});

describe('subscription disclosure (Apple 3.1.2)', () => {
  it('shows auto-renew terms, weekend non-renewing, Terms and Privacy links', async () => {
    await render(
      <EntitlementsProvider provider={new MockPurchaseProvider()}>
        <Gated feature="export"><Text>x</Text></Gated>
        <UpgradeSheet />
      </EntitlementsProvider>,
    );
    await fireEvent.press(screen.getByText('See passes'));
    const season = (await screen.findByTestId('disclosure-season')).props.children.join('');
    expect(season).toContain(PRODUCTS.season_pass_yearly.price.display);
    expect(season).toMatch(/auto-renewing yearly subscription/);
    expect(season).toMatch(/unless cancelled at least 24 hours before the end of the current period/);
    expect(season).toMatch(/Manage or cancel in your App Store or Google Play account settings/);
    expect(season).toContain(PRODUCTS.season_pass_yearly.introOffer!.price.display);
    expect(screen.getByTestId('disclosure-weekend').props.children).toMatch(/does not renew and is not a subscription/);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await fireEvent.press(screen.getByText('Terms of Service'));
    await fireEvent.press(screen.getByText('Privacy Policy'));
    expect(open).toHaveBeenCalledWith(legal.termsUrl);
    expect(open).toHaveBeenCalledWith(legal.privacyPolicyUrl);
    open.mockRestore();
  });
});

describe('Gated UI', () => {
  it('locks premium, never locks safety, opens upgrade sheet with placeholder note', async () => {
    await render(
      <EntitlementsProvider provider={new MockPurchaseProvider()}>
        <Gated feature="regs"><Text>regs-content</Text></Gated>
        <Gated feature="offlineMaps"><Text>maps-content</Text></Gated>
        <UpgradeSheet />
      </EntitlementsProvider>,
    );
    expect(screen.getByText('regs-content')).toBeTruthy();
    expect(screen.queryByText('maps-content')).toBeNull();
    await fireEvent.press(screen.getByText('See passes'));
    expect(await screen.findByTestId('price-placeholder')).toBeTruthy();
    expect(screen.getByText(/Placeholder prices, not final/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Get Season Pass'));
    expect(await screen.findByText('maps-content')).toBeTruthy();
  });
  it('useEntitlements without provider is free tier', async () => {
    let can = true;
    const Probe = () => { can = useEntitlements().canUse('export'); return null; };
    await render(<Probe />);
    expect(can).toBe(false);
  });
});

describe('StockingList gating', () => {
  const now = new Date('2026-10-01T16:00:00Z');
  it('free tier hides later release weeks behind the gate but keeps the disclaimer', async () => {
    await render(<StockingList places={samplePlaces} savedIds={[]} now={now} onPick={() => {}} />);
    expect(screen.getByTestId('stocking-disclaimer')).toBeTruthy();
    if (samplePlaces.some((p) => p.type === 'stocking')) {
      expect(screen.getAllByText(/Later release weeks: Season Pass/).length).toBeGreaterThan(0);
      expect(screen.getByTestId('gated-stockingCalendar')).toBeTruthy();
    }
  });
  it('Season Pass shows the full calendar', async () => {
    const p = new MockPurchaseProvider(() => now.getTime());
    await p.purchase('season_pass_yearly');
    await render(
      <EntitlementsProvider provider={p} initialState={await p.getEntitlements()} now={() => now.getTime()}>
        <StockingList places={samplePlaces} savedIds={[]} now={now} onPick={() => {}} />
      </EntitlementsProvider>,
    );
    expect(screen.queryByText(/Later release weeks: Season Pass/)).toBeNull();
    expect(screen.queryByTestId('gated-stockingCalendar')).toBeNull();
  });
});
