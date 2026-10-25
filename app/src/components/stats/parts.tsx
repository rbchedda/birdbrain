import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { Table, Tiles } from '@/data/statsCharts';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

export function PrivacyPill() {
  return (
    <View style={s.privacy} testID="stats-privacy" accessible accessibilityLabel="Only you can see these stats">
      <Ionicons name="lock-closed" size={14} color={colors.success} />
      <Text style={s.privacyText}>Only you</Text>
    </View>
  );
}

export function SeasonPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Season: ${label}. Change season`} onPress={onPress} style={s.season} testID="stats-season-pill">
      <Text style={s.seasonText}>{label}</Text>
      <Ionicons name="chevron-down" size={16} color={colors.text} />
    </Pressable>
  );
}

export function SampleBadge() {
  return (
    <View style={s.sample} testID="stats-sample-badge" accessible accessibilityLabel="Sample data, not your hunts">
      <Text style={s.sampleText}>SAMPLE DATA</Text>
    </View>
  );
}

const tileText = (label: string, v: number | null) => (v === null ? `${label}: none logged` : `${v} ${label}`);

export function TilesRow({ tiles }: { tiles: Tiles }) {
  const items: { label: string; v: number | null }[] = [
    { label: 'days afield', v: tiles.days },
    { label: 'flushes', v: tiles.flushes },
    { label: 'hours', v: tiles.hours },
    { label: 'game lands', v: tiles.gameLands },
  ];
  return (
    <View style={s.tiles} testID="stats-tiles">
      {items.map((t, i) => (
        <View key={t.label} style={s.tile} accessible accessibilityLabel={tileText(t.label, t.v)} testID={`stats-tile-${t.label.replace(' ', '-')}`}>
          <Text style={[s.tileValue, i === 0 && { color: colors.accent }]}>{t.v === null ? '–' : String(t.v)}</Text>
          <Text style={s.tileLabel}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function TableView({ table }: { table: Table }) {
  return (
    <View style={s.table} accessibilityRole="summary">
      <View style={s.trow}>
        {table.headers.map((h, i) => (
          <Text key={h} style={[s.th, i === 0 ? { flex: 2 } : { flex: 1, textAlign: 'right' }]}>{h}</Text>
        ))}
      </View>
      {table.rows.map((r, ri) => (
        <View key={ri} style={[s.trow, s.tbody]}>
          {r.map((c, i) => (
            <Text key={i} style={[s.td, i === 0 ? { flex: 2 } : { flex: 1, textAlign: 'right' }]}>{c}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** "View as table ›" link plus the table it reveals. */
export function TableToggle({ table, testID }: { table: Table; testID?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View testID={testID}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={s.link}>
        <Text style={s.linkText}>{open ? 'Hide table' : 'View as table ›'}</Text>
      </Pressable>
      {open && <TableView table={table} />}
    </View>
  );
}

export function Callout({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={s.callout} testID={testID} accessibilityLiveRegion="polite">
      {children}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange, testID }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <View style={s.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        <Text style={s.cap}>{hint}</Text>
      </View>
      <Switch testID={testID} accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} />
    </View>
  );
}

/** One chart card on the overview. */
export function ChartCard({
  title, insight, summary, note, onDetails, children, table, testID, details = true,
}: { title: string; insight: string; summary: string; note?: string | null; onDetails?: () => void; children: ReactNode; table?: Table; testID?: string; details?: boolean }) {
  return (
    <View style={s.card} testID={testID}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle} accessibilityRole="header">{title}</Text>
        {details && onDetails && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Details: ${title}`} onPress={onDetails} style={s.detailsBtn} hitSlop={6}>
            <Text style={s.linkText}>Details ›</Text>
          </Pressable>
        )}
      </View>
      <Text style={s.insight} accessibilityLabel={summary}>{insight}</Text>
      <View accessibilityLabel={summary} accessible={false}>{children}</View>
      {note ? <Text style={s.cap}>{note}</Text> : null}
      {table && <TableToggle table={table} testID={testID ? `${testID}-table` : undefined} />}
    </View>
  );
}

/** A chart that needs more hunts: a teaser with progress, never an error. */
export function LockedCard({ title, hint, have, need, ghost, testID }: { title: string; hint: string; have: number; need: number; ghost?: boolean; testID?: string }) {
  return (
    <View style={[s.card, s.locked, ghost && { opacity: 0.55 }]} testID={testID} accessible accessibilityLabel={`${title}, locked. ${hint}`}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{title}</Text>
        <Ionicons name="lock-closed" size={16} color={colors.muted} />
      </View>
      <Text style={s.cap}>{hint}</Text>
      {need > 1 && (
        <View style={s.progWrap}>
          <View style={s.prog}><View style={[s.progFill, { width: `${Math.min(100, (have / need) * 100)}%` }]} /></View>
          <Text style={s.cap}>{Math.min(have, need)} of {need} hunts</Text>
        </View>
      )}
    </View>
  );
}

export function Skeleton({ h = 120 }: { h?: number }) {
  return <View style={[s.skel, { height: h }]} />;
}

export function StatsHeaderRow({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.headRow}>
      {left}
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  privacyText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.success },
  season: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: touchTarget, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  seasonText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  sample: { alignSelf: 'center', backgroundColor: colors.dove, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sampleText: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.7, color: colors.onDove },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, minHeight: 80 },
  tileValue: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 30, color: colors.text },
  tileLabel: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted },
  table: { marginTop: space.xs },
  trow: { flexDirection: 'row', gap: space.sm, paddingVertical: 7 },
  tbody: { borderTopWidth: 1, borderTopColor: colors.border },
  th: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted },
  td: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  link: { minHeight: touchTarget, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.accent },
  callout: { backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: space.md, gap: 4, borderWidth: 1, borderColor: colors.border },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
  toggleLabel: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  cap: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: space.xs },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 },
  cardTitle: { fontFamily: fonts.heading, fontSize: 20, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.text },
  detailsBtn: { minHeight: touchTarget, justifyContent: 'center', marginVertical: -8 },
  insight: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.text, marginBottom: space.xs },
  locked: { borderStyle: 'dashed' },
  progWrap: { gap: 4, marginTop: space.xs },
  prog: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  progFill: { height: 8, backgroundColor: colors.dove },
  skel: { borderRadius: 16, backgroundColor: colors.surfaceRaised, opacity: 0.7 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
