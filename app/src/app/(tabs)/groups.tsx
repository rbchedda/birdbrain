import { StyleSheet, View } from 'react-native';

import { Placeholder, ScreenHeader } from '@/components/Screen';
import { colors, space } from '@/theme/tokens';

export default function GroupsScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader title="Groups" />
      <View style={{ paddingHorizontal: space.lg }}>
        <Placeholder>Pheasant, Dove, Turkey, Grouse and Waterfowl groups. Coming next.</Placeholder>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.ground } });
