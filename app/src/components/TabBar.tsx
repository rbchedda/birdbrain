import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, touchTarget } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

const icons: Record<string, { on: IconName; off: IconName }> = {
  map: { on: 'map', off: 'map-outline' },
  learn: { on: 'calendar', off: 'calendar-outline' },
  groups: { on: 'people', off: 'people-outline' },
  more: { on: 'ellipsis-horizontal-circle', off: 'ellipsis-horizontal-circle-outline' },
};

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        // Routes with href: null (redirect home, Community feed) stay off the bar.
        const options = descriptors[route.key].options as { href?: unknown };
        if (options.href === null) return null;
        const focused = state.index === index;
        const label = descriptors[route.key].options.title ?? route.name;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (route.name === 'diary') {
          return (
            <View key={route.key} style={styles.item}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Diary: log a hunt"
                accessibilityState={{ selected: focused }}
                onPress={onPress}
                style={({ pressed }) => [styles.logButton, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="add" size={32} color={colors.onAccent} />
              </Pressable>
              <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
            </View>
          );
        }

        const icon = icons[route.name] ?? icons.map;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.item}
          >
            <Ionicons name={focused ? icon.on : icon.off} size={24} color={focused ? colors.accent : colors.muted} />
            <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  item: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  label: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted },
  labelActive: { color: colors.accent },
  logButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginTop: -28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.ground,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
