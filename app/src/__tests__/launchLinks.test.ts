import { isPlaceholderLink, legal, mapErrorReportLink, supportLink, TODO_PUBLISH, unpublishedLinks } from '@/lib/env';
import { unsetLaunchLinkVars } from '../../app.config';

const VARS = ['EXPO_PUBLIC_PRIVACY_URL', 'EXPO_PUBLIC_TERMS_URL', 'EXPO_PUBLIC_SUPPORT_URL', 'EXPO_PUBLIC_SUPPORT_EMAIL', 'EXPO_PUBLIC_MAP_ERROR_URL'];

describe('launch links', () => {
  // Mutate process.env in place: Expo's env shim keeps a reference to the original object.
  const saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  beforeEach(() => VARS.forEach((k) => delete process.env[k]));
  afterAll(() => VARS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));

  it('falls back to obvious, non-resolving TODO_PUBLISH placeholders (never example.com)', () => {
    for (const v of [legal.privacyPolicyUrl, legal.termsUrl, legal.supportUrl, legal.mapErrorReportUrl]) {
      expect(v).toMatch(/^https:\/\/birdbrain\.invalid\/TODO_PUBLISH\//);
    }
    expect(legal.supportEmail).toBe(`${TODO_PUBLISH}@birdbrain.invalid`);
    expect(JSON.stringify(legal)).not.toMatch(/example\.com/);
    expect(unpublishedLinks()).toHaveLength(5);
    expect(unsetLaunchLinkVars()).toEqual(VARS);
  });

  it('uses the configured env values', () => {
    process.env.EXPO_PUBLIC_PRIVACY_URL = 'https://bb.test/privacy';
    process.env.EXPO_PUBLIC_TERMS_URL = 'https://bb.test/terms';
    process.env.EXPO_PUBLIC_SUPPORT_URL = 'https://bb.test/support';
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL = 'help@bb.test';
    process.env.EXPO_PUBLIC_MAP_ERROR_URL = 'https://bb.test/report';
    expect(legal.privacyPolicyUrl).toBe('https://bb.test/privacy');
    expect(legal.termsUrl).toBe('https://bb.test/terms');
    expect(unpublishedLinks()).toEqual([]);
    expect(unsetLaunchLinkVars()).toEqual([]);
    expect(isPlaceholderLink(legal.supportUrl)).toBe(false);
    expect(supportLink()).toBe('https://bb.test/support');
    expect(mapErrorReportLink({ id: 'sgl-1', name: 'SGL 1 & 2' })).toBe('https://bb.test/report?place=sgl-1&name=SGL%201%20%26%202');
  });

  it('support falls back to a mail to the inbox when only the email is published', () => {
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL = 'help@bb.test';
    expect(supportLink()).toBe('mailto:help@bb.test?subject=BirdBrain%20support');
  });

  it('map error report works as a mailto: address', () => {
    process.env.EXPO_PUBLIC_MAP_ERROR_URL = 'mailto:help@bb.test';
    const link = mapErrorReportLink({ id: 'sgl-1', name: 'SGL 1' });
    expect(link.startsWith('mailto:help@bb.test?subject=BirdBrain%20map%20error%3A%20SGL%201&body=')).toBe(true);
    expect(decodeURIComponent(link)).toContain('Place: SGL 1 (sgl-1)');
  });

  it('a form URL that already has a query string gets & params', () => {
    process.env.EXPO_PUBLIC_MAP_ERROR_URL = 'https://forms.test/f?id=1';
    expect(mapErrorReportLink({ id: 'a', name: 'b' })).toBe('https://forms.test/f?id=1&place=a&name=b');
  });
});

describe('iPhone only', () => {
  it('turns iPad support off in app.json and app.config', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appJson = require('../../app.json');
    expect(appJson.expo.ios.supportsTablet).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const makeConfig = require('../../app.config').default;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg = makeConfig({ config: appJson.expo });
    warn.mockRestore();
    expect(cfg.ios.supportsTablet).toBe(false);
  });
});
