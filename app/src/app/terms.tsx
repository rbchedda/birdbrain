import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { TermsContent } from '@/components/TermsContent';
import { colors, space } from '@/theme/tokens';

export default function TermsScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader back title="Terms of Service" />
      <ScrollView contentContainerStyle={styles.body}>
        <TermsContent />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
});
