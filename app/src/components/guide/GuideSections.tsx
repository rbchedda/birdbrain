import { router } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BirdCard } from '@/components/BirdCard';
import { DigestLink } from '@/components/guide/DigestLink';
import { OpenToday } from '@/components/OpenToday';
import { Tag } from '@/components/Tag';
import { Chip, SectionTitle, ui } from '@/components/ui';
import { birds, type BirdKey } from '@/data/birds';
import { gear } from '@/data/gear';
import { hoursZones, inSeasonRows, segmentsFor, shootingTimes, SPRING_GOBBLER_HOURS, type Badge } from '@/data/guide';
import { regTopics } from '@/data/guideRegs';
import { REGS } from '@/data/regs';
import { allSpecies, speciesLabel } from '@/data/types';
import { officialHours } from '@/lib/sun';
import { formatDay, type Ymd } from '@/lib/time';
import { colors, fonts, space } from '@/theme/tokens';

const badgeTone: Record<Badge, 'accent' | 'dove' | 'neutral'> = { OPEN: 'accent', SOON: 'dove', CLOSED: 'neutral', CHECK: 'neutral' };

function Header({ title, testID }: { title: string; testID: string }) {
  return (
    <View testID={testID}>
      <SectionTitle>{title}</SectionTitle>
      <DigestLink />
    </View>
  );
}

export function ZonePicker({ zone, onChange }: { zone: number; onChange: (z: number) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {hoursZones().map((z) => (
        <Chip key={z.zone} label={`Zone ${z.zone}`} active={z.zone === zone} onPress={() => onChange(z.zone)} />
      ))}
    </ScrollView>
  );
}

export function InSeasonSection({ ymd, zone, now, onZone }: { ymd: Ymd; zone: number; now: Date; onZone: (z: number) => void }) {
  const lng = hoursZones().find((z) => z.zone === zone)?.lng ?? -76.88;
  return (
    <View style={styles.section}>
      <Header title={`In season now · Zone ${zone}`} testID="guide-season" />
      <Text style={ui.muted}>PGC hours zone (east 1 → west 7). Pick yours:</Text>
      <ZonePicker zone={zone} onChange={onZone} />
      {inSeasonRows(ymd, zone, now).map((r) => (
        <View key={r.species} style={[ui.card, styles.rowCard]} testID={`in-season-${r.species}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{r.label}</Text>
            <Text style={ui.muted}>{r.detail}</Text>
          </View>
          <Tag label={r.badge} tone={badgeTone[r.badge]} />
        </View>
      ))}
      <OpenToday at={{ lat: 40.5, lng }} now={now} />
    </View>
  );
}

export function RegsSection() {
  return (
    <View style={styles.section}>
      <Header title="Regulations" testID="guide-regs" />
      {regTopics.map((t) => (
        <View key={t.key} style={ui.card} testID={`reg-${t.key}`}>
          <Text style={styles.name}>{t.title}</Text>
          {t.points.map((p) => (
            <Text key={p} style={ui.body}>
              • {p}
            </Text>
          ))}
          <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(t.url)}>
            {t.title} in the PGC digest ↗
          </Text>
        </View>
      ))}
    </View>
  );
}

export function BirdIdSection() {
  return (
    <View style={styles.section}>
      <Header title="Bird ID" testID="guide-birds" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
        {birds.map((b) => (
          <BirdCard key={b.key} bird={b} />
        ))}
      </ScrollView>
      <Text accessibilityRole="link" style={styles.link} onPress={() => router.push('/guide/credits')}>
        Photo credits ›
      </Text>
      <Text style={ui.muted}>Waterfowl ID is coming later.</Text>
    </View>
  );
}

export function GearSection({ bird, onBird }: { bird: BirdKey; onBird: (b: BirdKey) => void }) {
  const name = birds.find((b) => b.key === bird)?.name ?? bird;
  return (
    <View style={styles.section}>
      <Header title={`Gear needed · ${name}`} testID="guide-gear" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {birds.map((b) => (
          <Chip key={b.key} label={b.name} active={b.key === bird} onPress={() => onBird(b.key)} />
        ))}
      </ScrollView>
      {gear[bird].map((g) => (
        <View key={g.label} style={[ui.card, styles.rowCard]}>
          <Text style={ui.body}>☐ {g.label}</Text>
          {g.required && <Tag label="Required" tone="neutral" />}
        </View>
      ))}
      <Text style={ui.muted}>Educational checklist. No product recommendations. Legal requirements: verify with the digest.</Text>
    </View>
  );
}

export function BagSection() {
  return (
    <View style={styles.section}>
      <Header title="Bag limits" testID="guide-bag" />
      {allSpecies.map((sp) => {
        const r = REGS.species[sp];
        return (
          <View key={sp} style={ui.card} testID={`bag-${sp}`}>
            <Text style={styles.name}>{speciesLabel[sp]}</Text>
            <Text style={ui.body}>Daily: {r.daily}</Text>
            <Text style={ui.body}>Possession: {r.possession}</Text>
            <Text style={ui.muted}>Seasons: {segmentsFor(sp).map((s) => s.label).join(' · ')}</Text>
          </View>
        );
      })}
      <Text style={ui.muted}>{`Regulations v${REGS.version}, as of ${formatDay(REGS.asOf)}, ${REGS.asOf.slice(0, 4)}.`}</Text>
    </View>
  );
}

export function HoursSection({ ymd, zone }: { ymd: Ymd; zone: number }) {
  const rows = shootingTimes(ymd, zone);
  const span = (h: { start: string; end: string } | null) => (h ? `${h.start} – ${h.end}` : 'check the digest');
  return (
    <View style={styles.section}>
      <Header title={`Shooting times · Zone ${zone}`} testID="guide-hours" />
      <Text style={ui.muted}>From the official PGC hunting-hours table ({officialHours.version}). Never computed.</Text>
      <Text style={ui.body} testID="hours-spring-gobbler">{SPRING_GOBBLER_HOURS}</Text>
      {rows.map((r, i) => (
        <View key={r.ymd} style={ui.card} testID={`hours-${r.ymd}`}>
          <Text style={styles.name}>
            {i === 0 ? 'Today · ' : ''}
            {formatDay(r.ymd)}
            {r.sunday ? ' (Sunday)' : ''}
          </Text>
          <Text style={ui.body}>Pheasant, grouse, fall turkey: {span(r.smallGame)}</Text>
          <Text style={ui.body}>Doves, woodcock, waterfowl: {r.sunday ? 'closed Sundays' : span(r.migratory)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginBottom: space.lg },
  chips: { gap: space.sm, paddingVertical: space.xs },
  tiles: { gap: space.md, paddingVertical: space.xs },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text },
  link: { color: colors.accent, fontFamily: fonts.bodySemi, paddingVertical: space.xs },
});
