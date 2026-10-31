import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';

import type { Calendar, DogRow, FlushChart, MonthBar, PlaceRow, SpeciesRow } from '@/data/statsCharts';
import { fmtNum, monthShort } from '@/data/statsCharts';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Hand-built SVG charts (react-native-svg: no new native module, so they run in
 * Expo Go and on web). Color is never the only signal: last season is hatched,
 * dog flushes hatched and retrieves dotted, and every chart has a text summary
 * and a "View as table" in its card.
 */

export const HEAT_NONE = colors.surfaceRaised;
export const HEAT_ONE = colors.accent;
export const HEAT_MANY = '#FFD9C2';

/** Pattern fills. The outline on every patterned shape keeps it readable if a renderer ignores <Pattern>. */
export function Patterns() {
  return (
    <Defs>
      <Pattern id="bb-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <Rect width="6" height="6" fill={colors.surface} />
        <Line x1="0" y1="0" x2="0" y2="6" stroke={colors.dove} strokeWidth="2.2" />
      </Pattern>
      <Pattern id="bb-dots" width="6" height="6" patternUnits="userSpaceOnUse">
        <Rect width="6" height="6" fill={colors.surface} />
        <Circle cx="3" cy="3" r="1.4" fill={colors.dove} />
      </Pattern>
    </Defs>
  );
}
export const HATCH = 'url(#bb-hatch)';
export const DOTS = 'url(#bb-dots)';

/** Day counts are whole numbers: ticks are 0, ceil(max/2), max — never "2.5" (review tweak 9). */
export const dayTicks = (rawMax: number) => {
  const mx = Math.max(2, Math.ceil(rawMax));
  return { mx, ticks: [0, Math.ceil(mx / 2), mx] };
};

/** Little legend swatch. */
export function Swatch({ kind, label }: { kind: 'solid' | 'hatch' | 'dots'; label: string }) {
  return (
    <View style={s.legendItem}>
      <Svg width={16} height={12}>
        <Patterns />
        {kind === 'solid' ? (
          <Rect width={16} height={12} rx={2} fill={colors.accent} />
        ) : (
          <Rect x={0.75} y={0.75} width={14.5} height={10.5} rx={2} fill={kind === 'hatch' ? HATCH : DOTS} stroke={colors.dove} strokeWidth={1.5} />
        )}
      </Svg>
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

// --- 1. Grouped month bars -----------------------------------------------------

export function MonthBars({
  bars, compare, selected, onSelect, width, height = 170, big = false,
}: { bars: MonthBar[]; compare: boolean; selected: number | null; onSelect?: (i: number) => void; width: number; height?: number; big?: boolean }) {
  const top = 26;
  const bot = height - 24;
  const ph = bot - top;
  const { mx, ticks } = dayTicks(Math.max(...bars.map((b) => Math.max(b.days, compare ? (b.last ?? 0) : 0)), 1));
  const gw = (width - 26) / Math.max(bars.length, 1);
  return (
    <Svg width={width} height={height} accessibilityLabel="Bar chart of days afield by month">
      <Patterns />
      {ticks.map((v) => {
        const y = bot - (ph * v) / mx;
        return (
          <G key={v}>
            <Line x1={22} x2={width} y1={y} y2={y} stroke={colors.border} strokeWidth={1} strokeDasharray={v === 0 ? undefined : '3 3'} />
            <SvgText fontFamily={fonts.bodyMedium} x={0} y={y + 4} fontSize={12} fill={colors.muted}>{String(v)}</SvgText>
          </G>
        );
      })}
      {bars.map((b, i) => {
        const gx = 26 + i * gw + gw / 2;
        const showLast = compare && b.last !== null;
        const bw = Math.min(showLast ? gw * 0.3 : gw * 0.5, 34);
        const cx = showLast ? gx + 2 : gx - bw / 2;
        const ch = (ph * b.days) / mx;
        const on = selected === i;
        return (
          <G key={b.key}>
            {showLast && (() => {
              const lh = (ph * (b.last ?? 0)) / mx;
              return (
                <>
                  <Rect x={gx - bw - 2} y={bot - lh} width={bw} height={lh} rx={3} fill={HATCH} stroke={colors.dove} strokeWidth={1.5} />
                  <SvgText fontFamily={fonts.body} x={gx - bw / 2 - 2} y={bot - lh - 5} fontSize={12} fill={colors.muted} textAnchor="middle">{b.last}</SvgText>
                </>
              );
            })()}
            <Rect x={cx} y={bot - ch} width={bw} height={ch} rx={3} fill={colors.accent} stroke={on ? colors.text : undefined} strokeWidth={on ? 2.5 : 0} />
            {b.days > 0 && <SvgText x={cx + bw / 2} y={bot - ch - 5} fontFamily={fonts.bodySemi} fontSize={big ? 15 : 14} fill={colors.text} textAnchor="middle">{b.days}</SvgText>}
            <SvgText x={gx} y={height - 5} fontFamily={on ? fonts.bodySemi : fonts.bodyMedium} fontSize={13} fill={on ? colors.text : colors.muted} textAnchor="middle">{b.label}</SvgText>
            {onSelect && <Rect x={gx - gw / 2} y={0} width={gw} height={height} fill="transparent" onPress={() => onSelect(i)} />}
          </G>
        );
      })}
    </Svg>
  );
}

// --- 2. Calendar heat grid -----------------------------------------------------

export function CalendarHeat({ cal, width }: { cal: Calendar; width: number }) {
  const cols = cal.weeks.length;
  const gap = 2;
  const cell = Math.max(5, Math.min(14, Math.floor((width - (cols - 1) * gap) / cols)));
  const left = 0;
  const h = 16 + 7 * (cell + gap);
  return (
    <Svg width={width} height={h} accessibilityLabel="Calendar grid, one square per day">
      {cal.monthLabels.map((m) => (
        <SvgText fontFamily={fonts.body} key={m.col} x={left + m.col * (cell + gap)} y={11} fontSize={11} fill={colors.muted}>{m.label}</SvgText>
      ))}
      {cal.weeks.map((w, c) =>
        w.map((d, r) =>
          d ? (
            <Rect key={d.ymd} x={left + c * (cell + gap)} y={16 + r * (cell + gap)} width={cell} height={cell} rx={2} fill={d.hunts >= 2 ? HEAT_MANY : d.hunts === 1 ? HEAT_ONE : HEAT_NONE} />
          ) : null,
        ),
      )}
    </Svg>
  );
}

export function HeatLegend() {
  return (
    <View style={s.legend}>
      {[[HEAT_NONE, 'no hunt'], [HEAT_ONE, '1 hunt'], [HEAT_MANY, '2+ hunts']].map(([c, l]) => (
        <View key={l} style={s.legendItem}>
          <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: c, borderWidth: c === HEAT_NONE ? 1 : 0, borderColor: colors.border }} />
          <Text style={s.legendText}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

// --- 3/5. Horizontal bar lists -------------------------------------------------

export interface HBarItem {
  key: string;
  label: string;
  value: number;
  right: string;
  tag?: string;
}

export function HBars({ items, selected, onSelect, max }: { items: HBarItem[]; selected?: string | null; onSelect?: (key: string) => void; max?: number }) {
  const mx = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <View style={{ gap: space.sm }}>
      {items.map((it) => {
        const on = selected === it.key;
        return (
          <Pressable key={it.key} accessibilityRole="button" accessibilityLabel={`${it.label}, ${it.right}`} accessibilityState={{ selected: on }} disabled={!onSelect} onPress={() => onSelect?.(it.key)} style={s.hrow}>
            <View style={s.hhead}>
              <Text style={[s.hlabel, on && { color: colors.accent }]} numberOfLines={1}>
                {it.label}
                {it.tag ? <Text style={s.tag}>{`  ${it.tag}`}</Text> : null}
              </Text>
              <Text style={s.hright}>{it.right}</Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.max(2, (it.value / mx) * 100)}%`, backgroundColor: colors.accent, borderColor: on ? colors.text : colors.accent }]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export const speciesItems = (rows: SpeciesRow[]): HBarItem[] => rows.map((r) => ({ key: r.key, label: r.label, value: r.days, right: `${r.days} ${r.days === 1 ? 'day' : 'days'} · ${r.pct}%` }));
export const placeItems = (rows: PlaceRow[]): HBarItem[] => rows.map((r) => ({ key: r.key, label: r.label, value: r.days, right: `${r.days} ${r.days === 1 ? 'day' : 'days'}`, tag: r.isNew ? 'NEW' : undefined }));

// --- 4. Flush rate dots --------------------------------------------------------

export function FlushDots({ chart, selected, onSelect, width, height = 180 }: { chart: FlushChart; selected: number | null; onSelect?: (i: number) => void; width: number; height?: number }) {
  const pts = chart.points;
  const left = 28;
  const top = 14;
  const bot = height - 24;
  const ph = bot - top;
  const mx = Math.max(2, Math.ceil(Math.max(...pts.map((p) => p.rate), chart.avg) * 2) / 2);
  const n = pts.length;
  const x = (i: number) => left + 8 + ((width - left - 24) * (n === 1 ? 0.5 : i / (n - 1)));
  const y = (v: number) => bot - (ph * v) / mx;
  const trend = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.trend)}`).join(' ');
  const ticks = [0, mx / 2, mx];
  const monthTicks: { i: number; label: string }[] = [];
  pts.forEach((p, i) => {
    if (i === 0 || p.ymd.slice(0, 7) !== pts[i - 1].ymd.slice(0, 7)) monthTicks.push({ i, label: monthShort(p.ymd) });
  });
  return (
    <Svg width={width} height={height} accessibilityLabel="Dot chart of flushes per hour for each hunt">
      {ticks.map((v) => (
        <G key={v}>
          <Line x1={left} x2={width} y1={y(v)} y2={y(v)} stroke={colors.border} strokeWidth={1} strokeDasharray={v === 0 ? undefined : '3 4'} />
          <SvgText fontFamily={fonts.body} x={0} y={y(v) + 4} fontSize={12} fill={colors.muted}>{fmtNum(v)}</SvgText>
        </G>
      ))}
      {n > 0 && <Line x1={left} x2={width} y1={y(chart.avg)} y2={y(chart.avg)} stroke={colors.dove} strokeWidth={1.5} strokeDasharray="6 4" />}
      {n > 1 && <Path d={trend} stroke={colors.text} strokeOpacity={0.55} strokeWidth={2} fill="none" />}
      {pts.map((p, i) => (
        <G key={p.entryId}>
          <Circle cx={x(i)} cy={y(p.rate)} r={selected === i ? 8 : 5.5} fill={colors.accent} stroke={selected === i ? colors.text : colors.ground} strokeWidth={selected === i ? 2.5 : 1} />
          {onSelect && <Circle cx={x(i)} cy={y(p.rate)} r={14} fill="transparent" onPress={() => onSelect(i)} />}
        </G>
      ))}
      {monthTicks.map((m) => (
        <SvgText fontFamily={fonts.body} key={m.i} x={x(m.i)} y={height - 5} fontSize={12} fill={colors.muted} textAnchor="middle">{m.label}</SvgText>
      ))}
    </Svg>
  );
}

export function FlushLegend() {
  return (
    <View style={s.legend}>
      <View style={s.legendItem}><View style={[s.dot, { backgroundColor: colors.accent }]} /><Text style={s.legendText}>one hunt</Text></View>
      <View style={s.legendItem}><View style={{ width: 16, height: 2, backgroundColor: colors.text, opacity: 0.55 }} /><Text style={s.legendText}>3-hunt average</Text></View>
      <View style={s.legendItem}><Svg width={16} height={4}><Line x1={0} x2={16} y1={2} y2={2} stroke={colors.dove} strokeWidth={2} strokeDasharray="4 3" /></Svg><Text style={s.legendText}>season average</Text></View>
    </View>
  );
}

// --- 6. Dog bars ---------------------------------------------------------------

export function DogBars({ dog, max, width }: { dog: DogRow; max: { points: number; flushes: number; retrieves: number }; width: number }) {
  const rows: { label: string; v: number; mx: number; fill: string; stroke?: string }[] = [
    { label: 'Points', v: dog.points, mx: max.points, fill: colors.accent },
    { label: 'Flushes', v: dog.flushes, mx: max.flushes, fill: HATCH, stroke: colors.dove },
    { label: 'Retrieves', v: dog.retrieves, mx: max.retrieves, fill: DOTS, stroke: colors.dove },
  ];
  const lw = 70;
  const vw = 34;
  const bw = Math.max(40, width - lw - vw);
  return (
    <Svg width={width} height={rows.length * 26} accessibilityLabel={`${dog.name}: ${dog.points} points, ${dog.flushes} flushes, ${dog.retrieves} retrieves`}>
      <Patterns />
      {rows.map((r, i) => (
        <G key={r.label}>
          <SvgText fontFamily={fonts.body} x={0} y={i * 26 + 16} fontSize={13} fill={colors.muted}>{r.label}</SvgText>
          <Rect x={lw} y={i * 26 + 4} width={Math.max(r.v > 0 ? 4 : 0, (bw * r.v) / Math.max(r.mx, 1))} height={16} rx={3} fill={r.fill} stroke={r.stroke} strokeWidth={r.stroke ? 1.5 : 0} />
          <SvgText fontFamily={fonts.bodySemi} x={width} y={i * 26 + 16} fontSize={14} fill={colors.text} textAnchor="end">{r.v}</SvgText>
        </G>
      ))}
    </Svg>
  );
}

const s = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xs, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  dot: { width: 10, height: 10, borderRadius: 5 },
  hrow: { minHeight: 44, justifyContent: 'center', gap: 4 },
  hhead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  hlabel: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flexShrink: 1 },
  tag: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.dove, letterSpacing: 0.6 },
  hright: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  track: { height: 12, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 12, borderRadius: radius.sm, borderWidth: 1.5 },
});
