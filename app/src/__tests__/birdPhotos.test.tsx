import fs from 'node:fs';
import path from 'node:path';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { BirdCard } from '@/components/BirdCard';
import { birds } from '@/data/birds';
import credits from '../../assets/birds/CREDITS.json';

/** Width/height from a WebP header (VP8, VP8L or VP8X). */
function webpSize(file: string) {
  const b = fs.readFileSync(file);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  const bits = b.readUInt32LE(21);
  return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
}

describe('bird photos (beta-3.4 crop bug)', () => {
  it('every bundled photo is 4:3 and at least 1200 px wide (sharp on a full-width 3x screen)', () => {
    for (const c of credits as { file: string }[]) {
      const { w, h } = webpSize(path.join(__dirname, '../../assets/birds', c.file));
      expect(w).toBeGreaterThanOrEqual(1200);
      expect(w * 3).toBe(h * 4);
    }
  });

  it('photo frames are full-width 4:3 with cover, never a fixed height', async () => {
    const bird = birds.find((b) => b.photos.length > 1) ?? birds[0];
    await render(<BirdCard bird={bird} variant="full" />);
    for (const p of bird.photos) {
      const img = screen.getByTestId(`photo-${p.file}`);
      const frame = StyleSheet.flatten(img.parent!.props.style);
      expect(frame.aspectRatio).toBeCloseTo(4 / 3);
      expect(frame.width).toBe('100%');
      expect(frame.height).toBeUndefined();
      expect(frame.overflow).toBe('hidden');
      const st = StyleSheet.flatten(img.props.style);
      expect([st.width, st.height]).toEqual(['100%', '100%']);
      if (img.props.resizeMode) expect(img.props.resizeMode).toBe('cover');
    }
  });
});
