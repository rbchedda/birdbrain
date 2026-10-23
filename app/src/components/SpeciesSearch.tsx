import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useBottomSheetScroll } from '@/components/BottomSheet';
import { Tag } from '@/components/Tag';
import { Chip, ui } from '@/components/ui';
import {
  formatMiles,
  type BirdOption,
  type SearchBird,
  type SearchFilters,
  type SeasonTag,
  type SpotResult,
} from '@/data/speciesSearch';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

/** Suggestions under the search bar: "Try a bird" chips on focus, Birds group while typing. */
export function BirdSuggestions({
  query,
  matches,
  chips,
  onPick,
}: {
  query: string;
  matches: BirdOption[];
  chips: BirdOption[];
  onPick: (b: BirdOption) => void;
}) {
  const typing = query.trim().length >= 2;
  if (typing && !matches.length) return null;
  return (
    <View style={styles.panel} testID="bird-suggestions">
      <Text style={styles.group}>{typing ? 'Birds' : 'Try a bird'}</Text>
      {typing ? (
        matches.map((b) => (
          <Pressable key={b.key} accessibilityRole="button" accessibilityLabel={`Find spots for ${b.label}`} onPress={() => onPick(b)} style={styles.suggestion}>
            <Text style={styles.name}>{b.label}</Text>
          </Pressable>
        ))
      ) : (
        <View style={styles.chips}>
          {chips.map((b) => (
            <Chip key={b.key} label={b.label} onPress={() => onPick(b)} />
          ))}
        </View>
      )}
    </View>
  );
}

const tone = (t: SeasonTag) => (t.kind === 'open' ? ('accent' as const) : ('neutral' as const));

export interface SpeciesResultsProps {
  bird: BirdOption;
  seasonLabel: string;
  results: SpotResult[];
  filters: SearchFilters;
  onFilters: (f: SearchFilters) => void;
  /** 'gps' = live location; 'center' = no permission, ranked from the map center. */
  originKind: 'gps' | 'center';
  /** No signal: results come from places saved on the device. */
  savedOnly: boolean;
  emptyWhy: 'season_closed' | 'none_in_radius';
  onPick: (r: SpotResult) => void;
}

const nextRadius = { 25: 50, 50: 100, 100: 100 } as const;

export function SpeciesResults(p: SpeciesResultsProps) {
  const scroll = useBottomSheetScroll();
  const { filters, onFilters } = p;
  return (
    <View style={{ flex: 1, gap: space.sm }} testID="species-results">
      <Text style={styles.title}>{p.bird.label} near you</Text>
      <Text style={ui.muted}>{p.seasonLabel} · ranked by distance + habitat fit</Text>
      {p.savedOnly && <Text style={ui.muted} testID="species-saved">Showing saved results · distances live from GPS</Text>}
      {p.originKind === 'center' && (
        <Text style={ui.muted} testID="species-from-center">Location is off, so spots are ranked from the middle of the map.</Text>
      )}
      <View style={styles.chips}>
        <Chip label="Open now" active={filters.openNow} onPress={() => onFilters({ ...filters, openNow: !filters.openNow })} />
        <Chip label="Public only" active={filters.publicOnly} onPress={() => onFilters({ ...filters, publicOnly: !filters.publicOnly })} />
        <Chip
          label={`≤ ${filters.radiusMi} mi`}
          active
          onPress={() => onFilters({ ...filters, radiusMi: filters.radiusMi === 100 ? 25 : nextRadius[filters.radiusMi] })}
        />
      </View>
      {p.results.length ? (
        <FlatList
          data={p.results}
          keyExtractor={(r) => r.place.id}
          keyboardShouldPersistTaps="handled"
          {...scroll}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.rank}. ${item.place.name}, ${formatMiles(item.miles)}`}
              onPress={() => p.onPick(item)}
              style={styles.row}
            >
              <View style={[styles.pin, item.rank > 10 && styles.dotPin]}>
                {item.rank <= 10 && <Text style={styles.pinText}>{item.rank}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.place.name}
                </Text>
                <Text style={ui.muted} numberOfLines={1}>
                  {formatMiles(item.miles)} straight-line · {item.reason}
                  {item.accessNote ? ` · ${item.accessNote}` : ''}
                </Text>
              </View>
              <Tag label={item.tag.label} tone={tone(item.tag)} />
            </Pressable>
          )}
        />
      ) : (
        <View style={{ gap: space.sm }} testID="species-empty">
          <Text style={ui.muted}>
            {p.emptyWhy === 'season_closed'
              ? `${p.bird.label} season is closed today, so open-only spots are hidden.`
              : `No ${p.bird.label.toLowerCase()} spots within ${filters.radiusMi} mi.`}
          </Text>
          <View style={styles.chips}>
            {filters.radiusMi < 100 && (
              <Chip label={`Widen to ${nextRadius[filters.radiusMi]} mi`} onPress={() => onFilters({ ...filters, radiusMi: nextRadius[filters.radiusMi] })} />
            )}
            {filters.openNow && <Chip label="Show closed" onPress={() => onFilters({ ...filters, openNow: false })} />}
          </View>
        </View>
      )}
    </View>
  );
}

export function UnknownBird({ term, chips, onPick }: { term: string; chips: BirdOption[]; onPick: (b: BirdOption) => void }) {
  return (
    <View style={{ gap: space.sm }} testID="species-unknown">
      <Text style={styles.title}>We don’t cover {term.trim()} yet</Text>
      <View style={styles.chips}>
        {chips.map((b) => (
          <Chip key={b.key} label={b.label} onPress={() => onPick(b)} />
        ))}
      </View>
    </View>
  );
}

export type { SearchBird };

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.sm, gap: space.xs },
  group: { fontFamily: fonts.bodySemi, color: colors.muted, fontSize: 12, textTransform: 'uppercase' },
  suggestion: { minHeight: touchTarget, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  title: { fontFamily: fonts.bodySemi, fontSize: 18, color: colors.text },
  name: { fontFamily: fonts.bodySemi, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touchTarget, paddingVertical: space.xs },
  pin: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  dotPin: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 8 },
  pinText: { color: colors.onAccent, fontFamily: fonts.bodySemi, fontSize: 13 },
});
