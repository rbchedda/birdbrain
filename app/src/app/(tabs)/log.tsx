import { StyleSheet, View } from 'react-native';

import { Placeholder, ScreenHeader } from '@/components/Screen';
import { colors, space } from '@/theme/tokens';

export default function LogScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader title="Log" />
      <View style={{ paddingHorizontal: space.lg }}>
        <Placeholder>Quick post for a hunt or harvest. Coming next.</Placeholder>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.ground } });
