import { canUse, FREE_STATE } from './state';

// These tests cover the paid tier, which v1 hides (EXPO_PUBLIC_FLAG_PAYWALL off by default).
beforeAll(() => {
  process.env.EXPO_PUBLIC_FLAG_PAYWALL = '1';
});
afterAll(() => {
  delete process.env.EXPO_PUBLIC_FLAG_PAYWALL;
});

describe('field-test unlock', () => {
  const prev = process.env.EXPO_PUBLIC_FIELDTEST_UNLOCK;
  afterEach(() => { process.env.EXPO_PUBLIC_FIELDTEST_UNLOCK = prev; });
  it('keeps offline maps gated without the flag', () => {
    delete process.env.EXPO_PUBLIC_FIELDTEST_UNLOCK;
    expect(canUse('offlineMaps', FREE_STATE)).toBe(false);
  });
  it('unlocks offline maps with the flag', () => {
    process.env.EXPO_PUBLIC_FIELDTEST_UNLOCK = '1';
    expect(canUse('offlineMaps', FREE_STATE)).toBe(true);
  });
});
