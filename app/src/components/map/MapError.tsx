import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, space } from '@/theme/tokens';

export function MapError({ message }: { message: string }) {
  return (
    <View style={styles.error} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  text: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, textAlign: 'center' },
});
