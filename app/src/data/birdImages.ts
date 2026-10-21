import type { ImageSourcePropType } from 'react-native';

/**
 * Bundled bird photos (app/assets/birds), keyed by file name. Metro needs
 * static requires. Every file here has an entry in assets/birds/CREDITS.json
 * (enforced by scripts/check-bird-credits.ts); a slot without a file keeps the
 * grey placeholder.
 */
export const birdImages: Record<string, ImageSourcePropType> = {
  'pheasant-rooster.webp': require('../../assets/birds/pheasant-rooster.webp'),
  'pheasant-hen.webp': require('../../assets/birds/pheasant-hen.webp'),
  'ruffed-grouse.webp': require('../../assets/birds/ruffed-grouse.webp'),
  'american-woodcock.webp': require('../../assets/birds/american-woodcock.webp'),
  'mourning-dove.webp': require('../../assets/birds/mourning-dove.webp'),
  'wild-turkey-gobbler.webp': require('../../assets/birds/wild-turkey-gobbler.webp'),
  'wild-turkey-hen.webp': require('../../assets/birds/wild-turkey-hen.webp'),
  'northern-bobwhite.webp': require('../../assets/birds/northern-bobwhite.webp'),
};

/** Human-readable license name for captions, e.g. CC-BY-SA-4.0 -> CC BY-SA 4.0. */
export function licenseLabel(license: string) {
  const m = /^CC-(BY(?:-SA)?)-(\d\.\d)$/.exec(license);
  if (m) return `CC ${m[1]} ${m[2]}`;
  if (license === 'CC0-1.0') return 'CC0 1.0';
  if (/^PD-US/.test(license)) return 'Public domain (US government work)';
  if (license.startsWith('PD')) return 'Public domain';
  return license;
}
