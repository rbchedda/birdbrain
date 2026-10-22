import { ScrollView, StyleSheet, View } from 'react-native';

import { BirdIdSection } from '@/components/guide/GuideSections';
import { ScreenHeader } from '@/components/Screen';
import { colors, space } from '@/theme/tokens';

/** Guide › Bird ID (photo credits live here). */
export default function GuideBirdsScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader title="Bird ID" back />
      <ScrollView contentContainerStyle={styles.body}>
        <BirdIdSection />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
});
