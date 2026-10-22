import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { STATE_PARK_LINE_1, STATE_PARK_LINE_2, type StatePark } from '@/data/stateParks';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * Sheet for a tapped state park outline. Final wording, verbatim. Deliberately no
 * open/season tag, no "public hunting" and no access label: hunting is allowed only
 * in designated areas, which this app does not map.
 */
export function StateParkSheet({ park, onClose }: { park: StatePark; onClose: () => void }) {
  const openMap = () => Linking.openURL(park.huntingMapUrl).catch(() => {});
  return (
    <View style={{ gap: space.sm }} testID="state-park-sheet">
      <Text style={styles.title} accessibilityRole="header">
        {park.name}
      </Text>
      <Text style={styles.sub}>{park.county} County</Text>
      <Text accessibilityRole="link" style={styles.link} onPress={openMap} testID="state-park-line-1">
        {STATE_PARK_LINE_1}
      </Text>
      <Text style={styles.body} testID="state-park-line-2">
        {STATE_PARK_LINE_2}
      </Text>
      <Button label="Close" icon="close" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.text },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  link: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.park, textDecorationLine: 'underline' },
});
