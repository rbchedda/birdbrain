import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { EmptyState } from '@/components/States';
import { useSpot } from '@/components/spot/PlanParts';
import { birdByKey } from '@/data/birds';
import { speciesLabel } from '@/data/types';
import { formatDay, hoursText, SEASON_FOOTER, sunText, todayET, whatToHunt, type HuntRow } from '@/lib/spotPlan';
import { colors, fonts, radius, space } from '@/theme/tokens';


/** Spot detail spec 03: What you can hunt here (pushed screen). */
export default function WhatToHunt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = useSpot(id);
  const today = todayET();
  if (!place) {
    return (
      <View style={styles.root}>
        <ScreenHeader back title="What you can hunt here" />
        <Text style={[styles.muted, { padding: space.lg }]}>Spot not found.</Text>
      </View>
    );
  }
  const groups = whatToHunt(place, today);
  const hours = hoursText(place, today);
  const sun = sunText(place, today);
  return (
    <View style={styles.root}>
      <ScreenHeader back title="What you can hunt here" subtitle={place.name} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card} testID="hunt-top-card">
          <Text style={styles.title}>{formatDay(today)}</Text>
          <Text style={styles.text}>{hours ? `Legal hours ${hours}` : 'Legal hours: check the PGC digest'}</Text>
          {sun && <Text style={styles.muted}>{sun}</Text>}
        </View>
        {!groups.good.length && !groups.possible.length && (
          <EmptyState
            testID="hunt-empty"
            icon="leaf-outline"
            title="Nothing open today"
            body="No open seasons here today. See what opens next."
            secondary={{ label: 'See what opens next', onPress: () => router.push('/guide'), testID: 'hunt-empty-next' }}
          />
        )}
        <Group title="Good fit here" rows={groups.good} testID="group-good" />
        <Group title="Possible" rows={groups.possible} testID="group-possible" />
        <Text style={styles.muted} testID="season-footer">
          {SEASON_FOOTER}
        </Text>
      </ScrollView>
    </View>
  );
}

function Group({ title, rows, testID }: { title: string; rows: HuntRow[]; testID: string }) {
  if (!rows.length) return null;
  return (
    <View style={{ gap: space.xs }} testID={testID}>
      <Text style={styles.section}>{title}</Text>
      {rows.map((r) => {
        const guide = birdByKey(r.species);
        return (
          <Pressable
            key={r.species}
            accessibilityRole={guide ? 'link' : undefined}
            disabled={!guide}
            onPress={() => router.push({ pathname: '/guide/bird/[species]', params: { species: r.species } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            testID={`hunt-row-${r.species}`}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title}>{speciesLabel[r.species]}</Text>
              <Text style={styles.text}>{r.reason}</Text>
              <Text style={styles.muted}>
                {r.dates}
                {r.note ? ` · ${r.note}` : ''}
              </Text>
            </View>
            <View style={[styles.tag, r.tag.tone === 'open' && styles.tagOpen, r.tag.tone === 'soon' && styles.tagSoon]}>
              <Text style={[styles.tagText, r.tag.tone === 'open' && { color: colors.onAccent }]}>{r.tag.text}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, gap: 4, backgroundColor: colors.surfaceRaised },
  section: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  tag: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
  tagOpen: { backgroundColor: colors.accent, borderColor: colors.accent },
  tagSoon: { borderColor: colors.dove },
  tagText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text },
});
