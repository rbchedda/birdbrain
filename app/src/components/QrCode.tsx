import QRCode from 'qrcode';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

/** Renders text as a QR code (pure JS encoder + react-native-svg, works on iOS, Android and web). */
export function QrCode({ value, size = 220, testID }: { value: string; size?: number; testID?: string }) {
  const { n, d } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    let path = '';
    for (let y = 0; y < count; y++)
      for (let x = 0; x < count; x++) if (qr.modules.get(x, y)) path += `M${x + 2} ${y + 2}h1v1h-1z`;
    return { n: count + 4, d: path };
  }, [value]);
  return (
    <View testID={testID} accessibilityRole="image" accessibilityLabel="Crew invite QR code">
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
        <Rect x={0} y={0} width={n} height={n} fill="#ffffff" />
        <Path d={d} fill="#000000" />
      </Svg>
    </View>
  );
}
