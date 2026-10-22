import { ScrollView, StyleSheet, View } from 'react-native';

import { RegsSection } from '@/components/guide/GuideSections';
import { ScreenHeader } from '@/components/Screen';
import { colors, space } from '@/theme/tokens';

/** Guide › Regulations (also the Licenses tile). */
export default function GuideRegsScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader title="Regulations" back />
      <ScrollView contentContainerStyle={styles.body}>
        <RegsSection />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
});
