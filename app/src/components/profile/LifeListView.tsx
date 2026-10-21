import { StyleSheet, Text, View } from 'react-native';

import { SectionTitle, ui } from '@/components/ui';
import type { LifeListItem } from '@/data/stats';
import { speciesLabel, type Species } from '@/data/types';
import { formatDay } from '@/lib/time';
import { colors, fonts, space } from '@/theme/tokens';

export const lifeSummary = (items: LifeListItem[]) => {
  const species = items.filter((i) => i.kind === 'species');
  const fresh = items.filter((i) => i.isNew).length;
  return `${species.length} species · ${fresh} new this season`;
};

/** Species and SGLs hunted, with first dates. */
export function LifeListView({ items }: { items: LifeListItem[] }) {
  if (!items.length) return <Text style={ui.muted}>Your life list fills in as you log hunts.</Text>;
  const group = (kind: LifeListItem['kind']) => items.filter((i) => i.kind === kind);
  return (
    <View style={{ gap: space.sm }} testID="life-list">
      {(['species', 'game_land'] as const).map((kind) =>
        group(kind).length ? (
          <View key={kind} style={{ gap: space.xs }}>
            <SectionTitle>{kind === 'species' ? 'Species hunted' : 'Game lands hunted'}</SectionTitle>
            {group(kind).map((i) => (
              <View key={i.key} style={styles.row}>
                <Text style={styles.name}>{kind === 'species' ? speciesLabel[i.label as Species] : i.label}</Text>
                <Text style={ui.muted}>
                  first {formatDay(i.first)}
                  {i.isNew ? ' · new' : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.xs, borderBottomColor: colors.border, borderBottomWidth: 1 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
});
