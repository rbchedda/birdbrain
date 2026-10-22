import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { ui } from '@/components/ui';
import { useDataSources } from '@/data/hooks';
import {
  DATA_SOURCES_TEXT,
  DOVE_LINE,
  ENROLLED_PRIVATE_LINE,
  formatLayerDate,
  LAYER_LABELS,
  MAP_BANNER,
  publicLayers,
  SHEET_HEADING,
  sheetText,
  STOCKING_LINE,
} from '@/data/mapNotice';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * Map notice and data sources (Settings → Data sources; the map banner and every
 * place sheet link here). Layer dates come from ingest_state, never hard-coded.
 */
export default function DataSourcesScreen() {
  const layers = publicLayers(useDataSources());
  return (
    <View style={styles.root}>
      <ScreenHeader title="Map notice & data sources" back />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h}>Map notice</Text>
        <Text style={ui.body}>{MAP_BANNER}</Text>
        <Text style={ui.body}>
          <Text style={{ fontFamily: fonts.bodySemi }}>{SHEET_HEADING}</Text> {sheetText('as listed below')}
        </Text>
        <Text style={ui.body}>Stocking sites: {STOCKING_LINE}</Text>
        <Text style={ui.body}>Dove fields: {DOVE_LINE}</Text>
        <Text style={ui.body}>PGC access-program land: {ENROLLED_PRIVATE_LINE}</Text>

        <Text style={styles.h}>Data sources</Text>
        <Text style={ui.body} testID="data-sources-text">
          {DATA_SOURCES_TEXT('see each layer below')}
        </Text>
        <View style={{ gap: space.sm }}>
          {layers.map((l) => (
            <View key={l.source} style={styles.row} testID={`layer-${l.source}`}>
              <Text style={styles.layer}>{LAYER_LABELS[l.source]}</Text>
              <Text style={ui.muted}>
                Last updated: {formatLayerDate(l.lastEditDate)} (checked {formatLayerDate(l.lastRunAt)})
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  h: { fontFamily: fonts.heading, fontSize: 22, color: colors.text, marginTop: space.sm },
  row: { gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: space.sm },
  layer: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
});
