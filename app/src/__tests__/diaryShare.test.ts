import {
  DIARY_SHARE_DEFAULT_TTL_DAYS,
  DIARY_SHARE_DELAY_NOTE,
  DIARY_SHARE_MAX_TTL_DAYS,
  DIARY_SHARE_NEVER_SHARED,
  DIARY_SHARE_PHOTO_WARNING,
  DIARY_SHARE_VIEW_COUNT_DISCLOSE,
  DIARY_SHARE_WHATS_SHARED,
  diaryShareExpiringSoon,
  diaryShareUrl,
  formatViewedTimes,
} from '@/lib/diaryShare';

describe('diaryShare helpers', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });

  it('uses EXPO_PUBLIC_SHARE_BASE_URL without a trailing slash', () => {
    process.env.EXPO_PUBLIC_SHARE_BASE_URL = 'https://share.example.com/';
    let url: (t: string) => string = () => '';
    jest.isolateModules(() => {
      url = require('@/lib/diaryShare').diaryShareUrl;
    });
    expect(url('abc123')).toBe('https://share.example.com/share/?t=abc123');
  });

  it('falls back to a path-only URL when the base is unset', () => {
    delete process.env.EXPO_PUBLIC_SHARE_BASE_URL;
    let url: (t: string) => string = () => '';
    jest.isolateModules(() => {
      url = require('@/lib/diaryShare').diaryShareUrl;
    });
    expect(url('tok')).toBe('/share/?t=tok');
  });

  it('encodes the token in the query string', () => {
    expect(diaryShareUrl('a+b/c')).toContain('t=a%2Bb%2Fc');
  });

  it('formats owner view copy exactly', () => {
    expect(formatViewedTimes(0)).toBe('Viewed 0 times');
    expect(formatViewedTimes(12)).toBe('Viewed 12 times');
  });

  it('keeps TTL defaults in sync with legal rules', () => {
    expect(DIARY_SHARE_DEFAULT_TTL_DAYS).toBe(30);
    expect(DIARY_SHARE_MAX_TTL_DAYS).toBe(365);
  });

  it('flags links expiring within 3 days', () => {
    const now = Date.parse('2026-11-05T12:00:00.000Z');
    expect(diaryShareExpiringSoon(new Date(now + 2 * 86400000).toISOString(), now)).toBe(true);
    expect(diaryShareExpiringSoon(new Date(now + 10 * 86400000).toISOString(), now)).toBe(false);
    expect(diaryShareExpiringSoon(new Date(now - 1000).toISOString(), now)).toBe(false);
  });

  it("exposes What's shared / Never / Delay and lawyer photo/view copy", () => {
    expect(DIARY_SHARE_WHATS_SHARED).toMatch(/What's shared/);
    expect(DIARY_SHARE_NEVER_SHARED).toMatch(/Never shared/);
    expect(DIARY_SHARE_DELAY_NOTE).toMatch(/midnight Eastern/);
    expect(DIARY_SHARE_PHOTO_WARNING).toMatch(/^Photos can give away a spot/);
    expect(DIARY_SHARE_VIEW_COUNT_DISCLOSE).toBe(
      "You'll see how many times your link is viewed, not who viewed it.",
    );
  });
});
