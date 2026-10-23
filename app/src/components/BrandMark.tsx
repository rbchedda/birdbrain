import { Image, type ImageStyle, type StyleProp } from 'react-native';

/** Brand guide (birdbrain-logo/final/README): the master mark has a 64 px minimum; at or below it use the small 5-feather mark. */
export const MARK_MIN = 64;

const MASTER = require('../../assets/brand/mark.png');
const SMALL = require('../../assets/brand/mark-small.png');

export const markSourceFor = (size: number) => (size > MARK_MIN ? MASTER : SMALL);

/** BirdBrain mark (transparent, for the dark ground). Decorative: hidden from screen readers. */
export function BrandMark({ size, style }: { size: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={markSourceFor(size)}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessible={false}
      importantForAccessibility="no"
      testID={size > MARK_MIN ? 'brand-mark' : 'brand-mark-small'}
    />
  );
}
