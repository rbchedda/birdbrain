import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ALL_TIME, totalDays, type Scope } from '@/data/statsCharts';
import { seasonLabel } from '@/data/stats';
import type { JournalEntry } from '@/data/journal';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

/** Season filter. PA seasons run Jul 1 to Jun 30; All time is last. Past seasons and All time need multiYearStats. */
export function SeasonSheet({
  visible, onClose, onPick, scope, seasons, current, entries, multiYear,
}: {
  visible: boolean;
  onClose: () => void;
  /** Returns false when the season is locked (the upgrade sheet opens instead). */
  onPick: (s: Scope) => boolean;
  scope: Scope;
  seasons: { season: string; days: number }[];
  current: string;
  entries: JournalEntry[];
  multiYear: boolean;
}) {
  const rows: { key: Scope; title: string; sub: string; locked: boolean }[] = [
    ...seasons.map((s) => ({
      key: s.season,
      title: `${seasonLabel(s.season)}${s.season === current ? ' · this season' : ''}`,
      sub: s.days ? `${s.days} ${s.days === 1 ? 'day' : 'days'} afield` : 'No hunts yet',
      locked: s.season !== current && !multiYear,
    })),
    { key: ALL_TIME, title: 'All time', sub: `${totalDays(entries)} days · by season, no calendar`, locked: !multiYear },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close season list" accessibilityRole="button" />
      <View style={s.sheet} testID="season-sheet" accessibilityViewIsModal>
        <View style={s.grab} />
        <Text style={s.title} accessibilityRole="header">Season</Text>
        <Text style={s.sub}>PA seasons run Jul 1 to Jun 30.</Text>
        {rows.map((r) => (
          <Pressable
            key={r.key}
            testID={`season-option-${r.key}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: scope === r.key, disabled: false }}
            accessibilityLabel={`${r.title}, ${r.sub}${r.locked ? ', needs a pass' : ''}`}
            onPress={() => {
              if (onPick(r.key)) onClose();
            }}
            style={s.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{r.title}</Text>
              <Text style={s.sub}>{r.sub}</Text>
            </View>
            {r.locked ? <Ionicons name="lock-closed" size={18} color={colors.muted} /> : scope === r.key ? <Ionicons name="checkmark" size={22} color={colors.accent} /> : null}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, paddingBottom: space.xxl, gap: 2 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.sm },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.text },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget + 12, borderTopWidth: 1, borderTopColor: colors.border, gap: space.md },
  rowTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
});
