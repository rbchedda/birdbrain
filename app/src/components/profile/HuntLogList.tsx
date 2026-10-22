import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ui } from '@/components/ui';
import type { JournalEntry } from '@/data/journal';
import { coverLabel, speciesLabel } from '@/data/types';
import { formatDay } from '@/lib/time';
import { colors, fonts, space } from '@/theme/tokens';

export function syncBadge(e: JournalEntry, signedOut = false) {
  if (e.sync.status === 'synced') return { text: 'Backed up', icon: 'cloud-done-outline' as const, color: colors.success };
  if (e.sync.conflict) return { text: 'Conflict: changed elsewhere', icon: 'git-compare-outline' as const, color: colors.danger };
  if (e.sync.status === 'failed') return { text: 'Not backed up yet · will retry', icon: 'cloud-offline-outline' as const, color: colors.danger };
  return { text: signedOut ? 'On this device · sign in to back up' : 'Waiting to back up', icon: 'cloud-upload-outline' as const, color: colors.muted };
}

/** One-line summary: species · dog · cover · weather · flushes / shots. Never birds in hand. */
export function entrySummary(e: JournalEntry) {
  const d = e.details;
  const species = (d?.species.length ? d.species : e.species ? [e.species] : []).map((s) => speciesLabel[s]).join(', ');
  const w = d?.weather;
  const weather = w ? [w.tempF !== null ? `${w.tempF}°F` : null, w.windDir, w.windMph !== null ? String(w.windMph) : null].filter(Boolean).join(' ') : '';
  const flushes = d ? d.flushes : (e.placeCounts ?? []).reduce((t, c) => t + c.flushed, 0);
  return [species, d?.dogs.map((g) => g.name).join(', '), d?.cover[0] ? coverLabel[d.cover[0]] : null, weather, d ? `${flushes} flushes / ${d.shots} shots` : `${flushes} flushes`]
    .filter(Boolean)
    .join(' · ');
}

/** Private hunt log / diary list with per-entry sync status. */
export function HuntLogList({ entries, signedOut, limit }: { entries: JournalEntry[]; signedOut?: boolean; limit?: number }) {
  const list = [...entries].sort((a, b) => (b.huntedOn ?? b.createdAt).localeCompare(a.huntedOn ?? a.createdAt)).slice(0, limit);
  if (!list.length) return <Text style={ui.muted}>No hunts logged yet. Tap ＋ to log your first.</Text>;
  return (
    <View style={{ gap: space.sm }} testID="hunt-log-list">
      {list.map((e) => {
        const s = syncBadge(e, signedOut);
        const place = e.placeCounts?.[0]?.placeName ?? 'Private spot';
        return (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/diary/[id]', params: { id: e.id } })}
            style={ui.card}
            testID={`hunt-${e.clientId}`}
          >
            <Text style={styles.title} numberOfLines={1}>
              {(e.huntedOn ? formatDay(e.huntedOn) : 'Undated').toUpperCase()} · {place}
            </Text>
            <Text style={ui.muted} numberOfLines={2}>
              {entrySummary(e)}
            </Text>
            <View style={styles.row} accessibilityLabel={`Sync status: ${s.text}`}>
              <Text style={styles.private}>🔒 Private</Text>
              <Ionicons name={s.icon} size={14} color={s.color} />
              <Text style={[ui.muted, { color: s.color, fontSize: 12 }]}>{s.text}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Season view heat strip: one cell per week from Sep 1, orange if hunted. */
export function HeatStrip({ heat }: { heat: number[] }) {
  return (
    <View style={styles.heat} accessibilityLabel={`Season view: ${heat.filter(Boolean).length} weeks hunted`}>
      {heat.map((n, i) => (
        <View key={i} style={[styles.cell, { backgroundColor: n ? colors.accent : colors.border, opacity: n ? Math.min(1, 0.5 + n * 0.2) : 1 }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.heading, fontSize: 17, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  private: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.dove, marginRight: space.xs, borderWidth: 1, borderColor: colors.dove, borderRadius: 999, paddingHorizontal: 6, overflow: 'hidden' },
  heat: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: 22, height: 10, borderRadius: 3 },
});
