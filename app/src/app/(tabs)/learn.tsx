import { StyleSheet, View } from 'react-native';

import { Placeholder, ScreenHeader } from '@/components/Screen';
import { colors, space } from '@/theme/tokens';

export default function LearnScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader title="Learn" />
      <View style={{ paddingHorizontal: space.lg }}>
        <Placeholder>Seasons, licenses and species basics. Coming next.</Placeholder>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.ground } });
