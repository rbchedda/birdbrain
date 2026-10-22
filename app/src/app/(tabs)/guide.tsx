import { router, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DigestLink } from '@/components/guide/DigestLink';
import { useGuideZone } from '@/components/guide/useGuideZone';
import { ScreenHeader } from '@/components/Screen';
import { Tag } from '@/components/Tag';
import { SectionTitle, ui } from '@/components/ui';
import { birds } from '@/data/birds';
import { comingUp, inSeasonNow, inSeasonRows, shootingTimes, todayHoursSummary, type Badge } from '@/data/guide';
import { PGC_DIGEST_URL } from '@/data/regs';
import type { Species } from '@/data/types';
import { todayET } from '@/lib/time';
import { colors, fonts, radius, space } from '@/theme/tokens';

const badgeTone: Record<Badge, 'accent' | 'dove' | 'neutral'> = { OPEN: 'accent', SOON: 'dove', CLOSED: 'neutral', CHECK: 'neutral' };
const badgeText: Record<Badge, string> = { OPEN: 'Open', SOON: 'Soon', CLOSED: 'Closed', CHECK: 'Check digest' };

type Tile = { key: string; glyph: string; title: string; sub: string; href: '/guide/birds' | '/guide/regs' | '/guide/gear' };
const tiles: Tile[] = [
  { key: 'birds', glyph: '❦', title: 'Bird ID', sub: `${birds.length} upland species`, href: '/guide/birds' },
  { key: 'regs', glyph: '§', title: 'Regulations', sub: 'Orange, Sunday, SGL', href: '/guide/regs' },
  { key: 'gear', glyph: '☑', title: 'Gear checklist', sub: 'By species', href: '/guide/gear' },
  { key: 'licenses', glyph: '⌂', title: 'Licenses', sub: 'Licenses and permits', href: '/guide/regs' },
];

/** Guide (mockup 04): Today hero, In season now, then a 2×2 Explore grid. Values come from the bundled PGC data. */
export default function GuideScreen() {
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions({ title: 'Guide' }), [navigation]);

  const now = new Date();
  const ymd = todayET(now);
  // Zone is picked on the PGC table screen; the Today card just uses it.
  const [zone] = useGuideZone();
  const today = shootingTimes(ymd, zone, 1)[0];
  const all = inSeasonRows(ymd, zone, now);
  const rows = inSeasonNow(all);
  const upcoming = comingUp(ymd, zone, now, 3);
  const hours = todayHoursSummary(all, today);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Guide" />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.meta}>
          <Text style={ui.muted}>Zone {zone} · today · </Text>
          <DigestLink testID="guide-digest-top" />
        </View>

        <View style={[ui.card, styles.hero]} testID="guide-today">
          <View style={styles.heroHead}>
            <Text style={styles.name}>Today</Text>
            <Text accessibilityRole="link" style={styles.link} onPress={() => router.push('/guide/hours')}>
              PGC table ›
            </Text>
          </View>
          <Text style={ui.muted} testID="guide-today-label">
            {hours.label}
          </Text>
          {today?.smallGame ? (
            <View style={styles.times}>
              <View style={{ flex: 1 }}>
                <Text style={styles.time}>{today.smallGame.start}</Text>
                <Text style={ui.muted}>Shooting starts</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.time}>{today.smallGame.end}</Text>
                <Text style={ui.muted}>Shooting ends</Text>
              </View>
            </View>
          ) : (
            <Text style={ui.body}>Check the digest for today's hours.</Text>
          )}
          {hours.migratoryDiffers && (
            <Text accessibilityRole="link" style={styles.link} testID="guide-today-dove" onPress={() => router.push('/guide/hours')}>
              Dove hours differ ›
            </Text>
          )}
        </View>

        <View style={styles.section} testID="guide-season">
          <SectionTitle>{`In season now · Zone ${zone}`}</SectionTitle>
          {rows.length === 0 && <Text style={ui.muted}>Nothing open today. See the PGC table for all seasons.</Text>}
          {rows.map((r) => (
            <SpeciesRow key={r.species} species={r.species} testID={`in-season-${r.species}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{r.label}</Text>
                <Text style={ui.muted}>{r.detail}</Text>
              </View>
              <Tag label={badgeText[r.badge]} tone={badgeTone[r.badge]} />
            </SpeciesRow>
          ))}
          {upcoming.length > 0 && (
            <View style={styles.section} testID="guide-coming-up">
              <SectionTitle>Coming up</SectionTitle>
              {upcoming.map((r) => (
                <SpeciesRow key={r.species} species={r.species} testID={`coming-up-${r.species}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{r.label}</Text>
                    <Text style={ui.muted}>{r.status}</Text>
                  </View>
                </SpeciesRow>
              ))}
            </View>
          )}
          <Text style={styles.disclaimer} testID="guide-disclaimer">
            Unofficial summary, always verify with the PGC Hunting & Trapping Digest
          </Text>
          <Text
            accessibilityRole="link"
            accessibilityLabel="Open the PGC Hunting & Trapping Digest"
            style={styles.link}
            onPress={() => Linking.openURL(PGC_DIGEST_URL)}
          >
            PGC Hunting & Trapping Digest ↗
          </Text>
        </View>

        <View style={styles.section}>
          <SectionTitle>Explore</SectionTitle>
          <View style={styles.grid}>
            {tiles.map((t) => (
              <Pressable
                key={t.key}
                accessibilityRole="button"
                accessibilityLabel={t.title}
                testID={`guide-tile-${t.key}`}
                onPress={() => router.push(t.href)}
                style={[ui.card, styles.tile]}
              >
                <Text style={styles.glyph}>{t.glyph}</Text>
                <Text style={styles.rowName}>{t.title}</Text>
                <Text style={ui.muted}>{t.sub}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** A species list row; opens the species detail (dates, limits) when there is one. */
function SpeciesRow({ species, testID, children }: { species: Species; testID: string; children: React.ReactNode }) {
  const bird = birds.find((b) => b.species === species);
  if (!bird) {
    return (
      <View style={[ui.card, styles.rowCard]} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bird.name} details`}
      testID={testID}
      onPress={() => router.push(`/guide/bird/${bird.key}`)}
      style={[ui.card, styles.rowCard]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  hero: { gap: space.xs },
  heroHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  times: { flexDirection: 'row', gap: space.md, paddingVertical: space.xs },
  time: { fontFamily: fonts.headingSemi, fontSize: 28, color: colors.text },
  section: { gap: space.sm },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  link: { color: colors.accent, fontFamily: fonts.bodySemi, paddingVertical: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '48%', flexGrow: 1, gap: 2, minHeight: 96, borderRadius: radius.md },
  disclaimer: { color: colors.dove, fontFamily: fonts.bodySemi, fontSize: 14 },
  glyph: { fontSize: 20, color: colors.dove },
});
