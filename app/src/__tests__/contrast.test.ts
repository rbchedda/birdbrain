import { colors } from '@/theme/tokens';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const pairs: [string, keyof typeof colors, keyof typeof colors][] = [
  ['text on ground', 'text', 'ground'],
  ['text on surface', 'text', 'surface'],
  ['text on raised surface', 'text', 'surfaceRaised'],
  ['muted on ground', 'muted', 'ground'],
  ['muted on surface', 'muted', 'surface'],
  ['muted on raised surface', 'muted', 'surfaceRaised'],
  ['label on accent', 'onAccent', 'accent'],
  ['accent on surface (active tab)', 'accent', 'surface'],
  ['label on dove tag', 'onDove', 'dove'],
  ['danger on raised surface', 'danger', 'surfaceRaised'],
  ['success on raised surface', 'success', 'surfaceRaised'],
];

describe('design tokens meet 4.5:1 contrast', () => {
  it.each(pairs)('%s', (_, fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
