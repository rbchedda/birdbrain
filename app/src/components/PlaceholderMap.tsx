import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import type { Place, PlaceType } from '@/data/types';
import { colors, touchTarget } from '@/theme/tokens';

export const pinColor: Record<PlaceType, string> = {
  game_land: colors.text,
  stocking: colors.accent,
  dove_field: colors.dove,
};

/**
 * Stand-in for MapLibre until a development build exists. Draws a stylized
 * terrain background and tappable pins positioned by fractional coordinates.
 */
export function PlaceholderMap({
  places,
  selectedId,
  onSelect,
}: {
  places: Place[];
  selectedId?: string;
  onSelect: (place: Place) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} testID="placeholder-map">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Rect x="0" y="0" width="100" height="100" fill={colors.ground} />
        <Path d="M0 22 C 20 14, 35 30, 55 20 S 85 10, 100 18" stroke={colors.border} strokeWidth="0.4" fill="none" />
        <Path d="M0 40 C 25 32, 40 50, 62 40 S 88 30, 100 38" stroke={colors.border} strokeWidth="0.4" fill="none" />
        <Path d="M0 62 C 18 55, 42 70, 60 60 S 90 52, 100 60" stroke={colors.border} strokeWidth="0.4" fill="none" />
        <Path d="M0 82 C 22 76, 45 90, 66 80 S 92 72, 100 80" stroke={colors.border} strokeWidth="0.4" fill="none" />
        <Path d="M8 100 C 20 70, 40 60, 52 44 S 70 10, 92 0" stroke="#1E3A4A" strokeWidth="1.2" fill="none" />
        <Rect x="22" y="22" width="20" height="14" fill="#1C3326" stroke={colors.border} strokeWidth="0.3" />
        <Rect x="10" y="50" width="16" height="16" fill="#1C3326" stroke={colors.border} strokeWidth="0.3" />
      </Svg>
      {size.width > 0 &&
        places.map((place) => {
          const selected = place.id === selectedId;
          return (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              accessibilityLabel={place.name}
              accessibilityState={{ selected }}
              onPress={() => onSelect(place)}
              hitSlop={6}
              style={[
                styles.hit,
                { left: place.pin.x * size.width - touchTarget / 2, top: place.pin.y * size.height - touchTarget / 2 },
              ]}
            >
              <View
                style={[
                  styles.pin,
                  { backgroundColor: pinColor[place.type] },
                  selected && styles.pinSelected,
                ]}
              />
            </Pressable>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    position: 'absolute',
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: colors.ground },
  pinSelected: { width: 26, height: 26, borderRadius: 13, borderColor: colors.text },
});
