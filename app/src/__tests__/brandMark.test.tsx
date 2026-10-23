import { render } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';

import { BrandMark, MARK_MIN, markSourceFor } from '@/components/BrandMark';

describe('brand mark (birdbrain-logo/final README)', () => {
  it('uses the master mark above 64 px and the small mark at 64 px and below', async () => {
    expect(MARK_MIN).toBe(64);
    expect(markSourceFor(88)).not.toBe(markSourceFor(64));
    expect(markSourceFor(64)).toBe(markSourceFor(16));
    const big = await render(<BrandMark size={88} />);
    expect(big.getByTestId('brand-mark', { includeHiddenElements: true })).toBeTruthy();
    const small = await render(<BrandMark size={40} />);
    expect(small.getByTestId('brand-mark-small', { includeHiddenElements: true })).toBeTruthy();
  });

  it('app.json points icon, adaptive icon, splash and favicon at the new assets on the ground color', () => {
    const e = JSON.parse(fs.readFileSync(path.join(__dirname, '../../app.json'), 'utf8')).expo;
    expect(e.icon).toBe('./assets/icon.png');
    expect(e.splash).toMatchObject({ image: './assets/splash-icon.png', backgroundColor: '#0E1A13' });
    expect(e.plugins).toContainEqual(['expo-splash-screen', expect.objectContaining({ image: './assets/splash-icon.png', backgroundColor: '#0E1A13' })]);
    expect(e.android.adaptiveIcon).toMatchObject({ backgroundColor: '#0E1A13', monochromeImage: './assets/android-icon-monochrome.png' });
    expect(e.web.favicon).toBe('./assets/favicon.png');
  });
});
