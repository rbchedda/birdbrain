import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { Button, Notice } from '@/components/ui';
import { DogBars, FlushDots, FlushLegend, HBars, HeatLegend, MonthBars, Swatch, placeItems, speciesItems } from '@/components/stats/charts';
import { HEAT_MANY, HEAT_NONE, HEAT_ONE } from '@/components/stats/charts';
import { Callout, LockedCard, PrivacyPill, Skeleton, SampleBadge, TableToggle, ToggleRow } from '@/components/stats/parts';
import { useStatsData } from '@/components/stats/useStats';
import { seasonLabel } from '@/data/stats';
import { ALL_TIME, fmtNum, huntsInScope, speciesFor, type CalCell, type DogRow } from '@/data/statsCharts';
import { formatDay } from '@/lib/time';
import { colors, fonts, profileBottomPad, radius, space } from '@/theme/tokens';

const TITLES: Record<string, string> = { days: 'Days afield', calendar: 'Season calendar', species: 'What you hunted', flush: 'Flushes per hour', places: 'Places', dogs: 'Dog work' };

/** One chart, full size: every number is reachable by touch, never by hover. */
export default function StatsDetail() {
  const { chart = 'days', sample: sampleParam } = useLocalSearchParams<{ chart?: string; sample?: string }>();
  const sample = sampleParam === '1';
  const d = useStatsData(sample);
  const m = d.model;
  const win = useWindowDimensions();
  const w = Math.min(win.width, 560) - space.lg * 2;
  const label = d.scope === ALL_TIME ? 'All time' : `${seasonLabel(d.scope)} season`;
  const [sel, setSel] = useState<number | string | null>(null);
  const [compare, setCompare] = useState(true);
  const [once, setOnce] = useState(false);
  const [day, setDay] = useState<string | null>(null);

  const species = useMemo(() => (once ? speciesFor(huntsInScope(d.entries, d.scope), d.ctx, true) : m.species), [once, d.entries, d.scope, d.ctx, m.species]);

  const body = () => {
    if (d.loading) return <Skeleton h={260} />;
    if (m.state === 'empty') return <Notice>No hunts in {label} yet. Log a hunt and this chart fills in.</Notice>;
    switch (chart) {
      case 'days': {
        const showCmp = compare && d.multiYear && m.days.lastTotal !== null;
        const bar = typeof sel === 'number' ? m.days.bars[sel] : null;
        return (
          <>
            <Text style={styles.insight}>{m.days.insight}</Text>
            {d.multiYear && m.days.lastTotal !== null && <ToggleRow label="Compare with last season" hint="Hatched bars are last season." value={compare} onChange={setCompare} testID="stats-compare" />}
            <MonthBars bars={m.days.bars} compare={showCmp} selected={typeof sel === 'number' ? sel : null} onSelect={setSel} width={w} height={240} big />
            <View style={styles.legend}>
              <Swatch kind="solid" label={d.scope === ALL_TIME ? 'Days' : seasonLabel(d.scope)} />
              {showCmp && <Swatch kind="hatch" label="Last season" />}
            </View>
            <Callout testID="stats-callout">
              <Text style={styles.calloutText}>
                {bar
                  ? `${bar.longLabel}: ${bar.days} ${bar.days === 1 ? 'day' : 'days'}, ${bar.flushes} flushes, ${Math.round(bar.hours * 10) / 10} h${showCmp && bar.last !== null ? `. Last season: ${bar.last}.` : '.'}`
                  : 'Tap a bar for that month.'}
              </Text>
            </Callout>
            <Text style={styles.cap}>{m.days.note}</Text>
            <TableToggle table={m.days.table} testID="stats-table" />
          </>
        );
      }
      case 'calendar': {
        const cal = m.calendar;
        if (!cal) return <Notice>The calendar shows one season at a time. Pick a season to see it.</Notice>;
        return (
          <>
            <Text style={styles.insight}>{cal.detailInsight}</Text>
            <HeatLegend />
            {cal.months.map((mo) => (
              <View key={mo.key} style={{ gap: space.xs }} testID={`stats-month-${mo.key}`}>
                <Text style={styles.monthTitle}>{mo.title}</Text>
                <View style={styles.grid}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((c, i) => (
                    <Text key={i} style={styles.dow}>{c}</Text>
                  ))}
                  {mo.cells.map((c, i) => (c ? <DayCell key={c.ymd} cell={c} onPress={() => setDay(c.ymd)} /> : <View key={`b${i}`} style={styles.cellBlank} />))}
                </View>
              </View>
            ))}
            <Text style={styles.cap}>Tap a day to see its hunts.</Text>
            <TableToggle table={{ headers: ['Date', 'Hunts'], rows: [...cal.byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [formatDay(k), String(v.length)]) }} testID="stats-table" />
            <Modal visible={day !== null} transparent animationType="slide" onRequestClose={() => setDay(null)}>
              <Pressable style={styles.backdrop} onPress={() => setDay(null)} accessibilityRole="button" accessibilityLabel="Close day" />
              <View style={styles.sheet} testID="stats-day-sheet">
                <Text style={styles.sheetTitle} accessibilityRole="header">{day ? formatDay(day) : ''}</Text>
                {(day ? cal.byDay.get(day) ?? [] : []).map((h) => (
                  <View key={h.entryId} style={styles.dayRow}>
                    <Text style={styles.dayPlace}>{h.place ?? 'Private spot'}</Text>
                    <Text style={styles.cap}>{[`${h.flushes} flushes`, h.hours !== null ? `${h.hours} h` : null, h.miles !== null ? `${h.miles} mi` : null, h.dogs.length ? h.dogs.join(', ') : null].filter(Boolean).join(' · ')}</Text>
                    {!sample && (
                      <Pressable accessibilityRole="link" onPress={() => { setDay(null); router.push({ pathname: '/diary/[id]', params: { id: h.entryId } }); }} style={styles.link} testID="stats-open-diary">
                        <Text style={styles.linkText}>Open diary entry ›</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
                {day && !(cal.byDay.get(day)?.length) && <Text style={styles.cap}>No hunt logged this day.</Text>}
                <Button label="Close" onPress={() => setDay(null)} />
              </View>
            </Modal>
          </>
        );
      }
      case 'species': {
        if (!m.gates.species.ready) return <LockedCard title="What you hunted" hint={m.gates.species.hint} have={m.gates.species.have} need={m.gates.species.need} />;
        const row = species.rows.find((r) => r.key === sel);
        return (
          <>
            <Text style={styles.insight}>{species.insight}</Text>
            <ToggleRow label="Count each day once" hint="A day with two birds counts for one bird, so the bars add up." value={once} onChange={setOnce} testID="stats-count-once" />
            <HBars items={speciesItems(species.rows)} selected={typeof sel === 'string' ? sel : null} onSelect={(k) => setSel(k)} />
            <Callout testID="stats-callout">
              <Text style={styles.calloutText}>
                {row ? `${row.label}: ${row.days} ${row.days === 1 ? 'day' : 'days'}, ${row.flushes} flushes${row.rate !== null ? `, ${row.rate} an hour` : ''}${row.bestMonth ? `. Best month ${row.bestMonth.label} (${row.bestMonth.days}).` : '.'}` : 'Tap a bar for details.'}
              </Text>
            </Callout>
            <Text style={styles.cap}>{once ? 'Each hunt day counts once, under its first bird.' : species.note}</Text>
            {species.woodcockNote ? <Text style={styles.cap}>{species.woodcockNote}</Text> : null}
            {!sample && row && (
              <Pressable accessibilityRole="link" style={styles.link} onPress={() => router.push({ pathname: '/profile/hunt-log', params: { species: row.species.join(','), label: row.label } })}>
                <Text style={styles.linkText}>See these hunts in your log ›</Text>
              </Pressable>
            )}
            <TableToggle table={species.table} testID="stats-table" />
          </>
        );
      }
      case 'flush': {
        const f = m.flush;
        if (!f) return <Notice>Flush rates are shown one season at a time. Pick a season to see them.</Notice>;
        if (!m.gates.flush.ready) return <LockedCard title="Flushes per hour" hint={m.gates.flush.hint} have={m.gates.flush.have} need={m.gates.flush.need} />;
        const p = typeof sel === 'number' ? f.points[sel] : null;
        return (
          <>
            <Text style={styles.insight}>{f.insight}</Text>
            <FlushDots chart={f} selected={typeof sel === 'number' ? sel : null} onSelect={setSel} width={w} height={240} />
            <FlushLegend />
            <Callout testID="stats-callout">
              <Text style={styles.calloutText}>
                {p ? `${formatDay(p.ymd)}: ${p.flushes} flushes in ${p.hours} h, ${p.rate} an hour${p.place ? ` at ${p.place}` : ''}${p.weather ? `, ${p.weather}` : ''}.` : 'Tap a dot for that hunt.'}
              </Text>
            </Callout>
            <Text style={styles.cap}>{f.note}</Text>
            <TableToggle table={f.table} testID="stats-table" />
          </>
        );
      }
      case 'places': {
        if (!m.gates.places.ready) return <LockedCard title="Places" hint={m.gates.places.hint} have={m.gates.places.have} need={m.gates.places.need} />;
        const row = m.places.rows.find((r) => r.key === sel);
        return (
          <>
            <Text style={styles.insight}>{m.places.insight}</Text>
            <HBars items={placeItems(m.places.rows)} selected={typeof sel === 'string' ? sel : null} onSelect={(k) => setSel(k)} />
            <Callout testID="stats-callout">
              <Text style={styles.calloutText}>{row ? `${row.label}: ${row.days} ${row.days === 1 ? 'day' : 'days'}${row.isNew ? '. New this season.' : '.'}` : 'Tap a place for details.'}</Text>
            </Callout>
            {!sample && row && (
              <Pressable accessibilityRole="link" style={styles.link} onPress={() => router.push({ pathname: '/profile/hunt-log', params: { ids: row.entryIds.join(','), label: row.label } })}>
                <Text style={styles.linkText}>See these hunts in your log ›</Text>
              </Pressable>
            )}
            {m.places.counties.length > 0 && (
              <View style={{ gap: space.xs }}>
                <Text style={styles.monthTitle}>Counties</Text>
                <View style={styles.chips} testID="stats-counties">
                  {m.places.counties.map((c) => (
                    <View key={c.name} style={styles.chip}><Text style={styles.chipText}>{`${c.name} ${c.days}`}</Text></View>
                  ))}
                </View>
              </View>
            )}
            <Text style={styles.cap}>{m.places.note ?? 'No map and no coordinates: only place names and counts.'}</Text>
            <TableToggle table={m.places.table} testID="stats-table" />
          </>
        );
      }
      case 'dogs': {
        const dg = m.dogs;
        if (!dg || !dg.rows.length) return <Notice>No dog work logged in {label}. Add a dog to a hunt to see it here.</Notice>;
        const max = { points: Math.max(...dg.rows.map((r) => r.points), 1), flushes: Math.max(...dg.rows.map((r) => r.flushes), 1), retrieves: Math.max(...dg.rows.map((r) => r.retrieves), 1) };
        return (
          <>
            <Text style={styles.insight}>{dg.insight}</Text>
            {dg.rows.map((r: DogRow) => (
              <View key={r.dogId} style={styles.dogCard}>
                <Text style={styles.dogName}>{r.name}<Text style={styles.cap}>{`  ${r.breed ? `${r.breed} · ` : ''}${r.hunts} ${r.hunts === 1 ? 'hunt' : 'hunts'}${r.isNew ? ' · new this season' : ''}`}</Text></Text>
                <DogBars dog={r} max={max} width={w - space.md * 2} />
                <Text style={styles.cap}>{r.perHunt ? `Per hunt: ${fmtNum(r.perHunt.points)} points, ${fmtNum(r.perHunt.flushes)} flushes, ${fmtNum(r.perHunt.retrieves)} retrieves.` : 'Per-hunt averages show after 3 hunts together.'}</Text>
              </View>
            ))}
            <View style={styles.legend}>
              <Swatch kind="solid" label="solid = points" />
              <Swatch kind="hatch" label="hatched = flushes" />
              <Swatch kind="dots" label="dotted = retrieves" />
            </View>
            <TableToggle table={dg.table} testID="stats-table" />
          </>
        );
      }
      default:
        return <Notice>That chart does not exist.</Notice>;
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile/stats" title={TITLES[chart] ?? 'Stats'} subtitle={label} />
      <ScrollView contentContainerStyle={styles.body} testID={`stats-detail-${chart}`}>
        {sample && <SampleBadge />}
        <View style={{ flexDirection: 'row' }}><PrivacyPill /></View>
        {body()}
      </ScrollView>
    </View>
  );
}

function DayCell({ cell, onPress }: { cell: CalCell; onPress: () => void }) {
  const bg = cell.hunts === 0 ? HEAT_NONE : cell.hunts === 1 ? HEAT_ONE : HEAT_MANY;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatDay(cell.ymd)}, ${cell.hunts === 0 ? 'no hunt' : cell.hunts === 1 ? '1 hunt' : `${cell.hunts} hunts`}`}
      onPress={onPress}
      style={[styles.cell, { backgroundColor: bg }, cell.hunts > 1 && { borderWidth: 2, borderColor: HEAT_ONE }]}
      testID={`stats-day-${cell.ymd}`}
    >
      <Text style={[styles.cellText, cell.hunts === 1 && { color: colors.ground }]}>{Number(cell.ymd.slice(8))}</Text>
    </Pressable>
  );
}

const CELL = 44;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: profileBottomPad, gap: space.md },
  insight: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: colors.text },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cap: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.muted },
  calloutText: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21, color: colors.text },
  monthTitle: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: CELL * 7 },
  dow: { width: CELL, textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  cell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  cellBlank: { width: CELL, height: CELL },
  cellText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 36, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, paddingBottom: space.xxl, gap: space.sm },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 24, color: colors.text },
  dayRow: { gap: 2, paddingVertical: space.xs },
  dayPlace: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  dogCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.xs },
  dogName: { fontFamily: fonts.heading, fontSize: 20, color: colors.text },
});
