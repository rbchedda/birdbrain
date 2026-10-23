import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { TermsContent } from '@/components/TermsContent';
import { ui } from '@/components/ui';
import { MAP_BANNER } from '@/data/mapNotice';
import { colors, space } from '@/theme/tokens';

export default function TermsScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader back title="Terms of Service" />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.notice} testID="terms-map-notice">
          <Text style={ui.body} accessibilityRole="header">
            Map notice
          </Text>
          <Text style={ui.body}>{MAP_BANNER}</Text>
        </View>
        <TermsContent />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  notice: { gap: space.xs, paddingVertical: space.md },
});
