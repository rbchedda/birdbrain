import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays, type Ymd } from '@/lib/time';
import { colors, fonts, radius, space } from '@/theme/tokens';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dow = (ymd: Ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const monthStart = (ymd: Ymd) => `${ymd.slice(0, 7)}-01` as Ymd;
const shiftMonth = (first: Ymd, n: number): Ymd => {
  const [y, m] = first.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10) as Ymd;
};

/** Dependency-free month calendar (no native date picker module), limited to [min, max]. */
export function DateGrid({ value, min, max, onChange }: { value: Ymd; min: Ymd; max: Ymd; onChange: (d: Ymd) => void }) {
  const [month, setMonth] = useState<Ymd>(monthStart(value));
  const [y, m] = month.split('-').map(Number);
  const days: (Ymd | null)[] = Array(dow(month)).fill(null);
  for (let d = month; d.slice(0, 7) === month.slice(0, 7); d = addDays(d, 1)) days.push(d);
  const canPrev = month > monthStart(min);
  const canNext = shiftMonth(month, 1) <= max;
  return (
    <View style={styles.wrap} testID="date-grid">
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={!canPrev} onPress={() => setMonth(shiftMonth(month, -1))} style={[styles.nav, !canPrev && { opacity: 0.3 }]}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.month}>
          {MONTHS[m - 1]} {y}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={!canNext} onPress={() => setMonth(shiftMonth(month, 1))} style={[styles.nav, !canNext && { opacity: 0.3 }]}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {days.map((d, i) => {
          if (!d) return <View key={`b${i}`} style={styles.cell} />;
          const ok = d >= min && d <= max;
          const on = d === value;
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={d}
              accessibilityState={{ selected: on, disabled: !ok }}
              disabled={!ok}
              onPress={() => onChange(d)}
              style={[styles.cell, on && styles.on, !ok && { opacity: 0.3 }]}
            >
              <Text style={[styles.day, on && { color: colors.onAccent }]}>{Number(d.slice(8))}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 24, color: colors.text },
  month: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  on: { backgroundColor: colors.accent },
  day: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
});
