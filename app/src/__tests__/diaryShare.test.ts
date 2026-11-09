import { flags } from '@/lib/flags';
import {
  DIARY_SHARE_DEFAULT_TTL_DAYS,
  DIARY_SHARE_DELAY_NOTE,
  DIARY_SHARE_MAX_TTL_DAYS,
  DIARY_SHARE_NEVER_SHARED,
  DIARY_SHARE_PHOTO_WARNING_LIVE,
  DIARY_SHARE_PHOTO_WARNING_SOFT,
  DIARY_SHARE_VIEW_COUNT_DISCLOSE,
  DIARY_SHARE_WHATS_SHARED_LIVE,
  DIARY_SHARE_WHATS_SHARED_SOFT,
  diaryShareExpiringSoon,
  diarySharePhotoWarning,
  diaryShareUrl,
  diaryShareWhatsShared,
  formatViewedTimes,
} from '@/lib/diaryShare';

describe('diaryShare helpers', () => {
  const saved = { ...process.env };
  afterEach(() => {
    // Mutate in place — expo/virtual/env is the same object as process.env; replacing
    // the binding would leave flag getters reading a stale env.
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k];
    }
    Object.assign(process.env, saved);
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

  it('diaryShare flag defaults off', () => {
    delete process.env.EXPO_PUBLIC_FLAG_DIARY_SHARE;
    expect(flags.diaryShare).toBe(false);
    process.env.EXPO_PUBLIC_FLAG_DIARY_SHARE = '1';
    expect(flags.diaryShare).toBe(true);
    delete process.env.EXPO_PUBLIC_FLAG_DIARY_SHARE;
  });

  it('flags links expiring within 3 days', () => {
    const now = Date.parse('2026-11-05T12:00:00.000Z');
    expect(diaryShareExpiringSoon(new Date(now + 2 * 86400000).toISOString(), now)).toBe(true);
    expect(diaryShareExpiringSoon(new Date(now + 10 * 86400000).toISOString(), now)).toBe(false);
    expect(diaryShareExpiringSoon(new Date(now - 1000).toISOString(), now)).toBe(false);
  });

  it("exposes What's shared / Never / Delay and lawyer photo/view copy", () => {
    expect(DIARY_SHARE_WHATS_SHARED_SOFT).toMatch(/What's shared/);
    expect(DIARY_SHARE_NEVER_SHARED).toMatch(/Never shared/);
    expect(DIARY_SHARE_DELAY_NOTE).toMatch(/midnight Eastern/);
    expect(DIARY_SHARE_PHOTO_WARNING_SOFT).toMatch(/^Photos can give away a spot/);
    expect(DIARY_SHARE_VIEW_COUNT_DISCLOSE).toBe(
      "You'll see how many times your link is viewed, not who viewed it.",
    );
  });

  it('defaults share copy to softened wording that does not promise stripping', () => {
    delete process.env.EXPO_PUBLIC_FLAG_PHOTO_STRIP_LIVE;
    expect(flags.photoStripLive).toBe(false);
    expect(diarySharePhotoWarning()).toBe(DIARY_SHARE_PHOTO_WARNING_SOFT);
    expect(diaryShareWhatsShared()).toBe(DIARY_SHARE_WHATS_SHARED_SOFT);
    expect(diarySharePhotoWarning()).not.toMatch(/location data/);
    expect(diarySharePhotoWarning()).not.toMatch(/We remove/);
    expect(diaryShareWhatsShared()).not.toMatch(/location data removed/);
    expect(diarySharePhotoWarning()).toBe(
      'Photos can give away a spot. Signs, gates, parking areas and license plates can show where you were. Crop them out before sharing.',
    );
    expect(diaryShareWhatsShared()).toBe(
      "What's shared: date, species, flushes, hours, birds, dog name, note, and photos. Game-land names stay in the app and with your crew.",
    );
  });

  it('uses the lawyer stripping-promise copy only when the live flag is on', () => {
    process.env.EXPO_PUBLIC_FLAG_PHOTO_STRIP_LIVE = '1';
    expect(flags.photoStripLive).toBe(true);
    expect(diarySharePhotoWarning()).toBe(DIARY_SHARE_PHOTO_WARNING_LIVE);
    expect(diaryShareWhatsShared()).toBe(DIARY_SHARE_WHATS_SHARED_LIVE);
    expect(diarySharePhotoWarning()).toMatch(/We remove location data from the file/);
    expect(diaryShareWhatsShared()).toMatch(/photos with location data removed/);
  });
});
