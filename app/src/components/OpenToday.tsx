import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Tag } from '@/components/Tag';
import { ui } from '@/components/ui';
import { PGC_DIGEST_URL, REGS, regsFor } from '@/data/regs';
import { describeStatus, speciesStatus } from '@/data/seasons';
import { allSpecies, speciesLabel, type Species } from '@/data/types';
import { pgcHoursZone, type HuntingHoursRow } from '@/lib/sun';
import { formatDay, todayET, weekdayOf } from '@/lib/time';
import { colors, fonts, space } from '@/theme/tokens';

/** Harrisburg, used until onboarding sets the user's home county/zone. */
export const DEFAULT_AT = { lat: 40.27, lng: -76.88 };

/**
 * "Open today?" card: for each species, season status and legal hours for the
 * user's PGC hours zone, bag and possession limits, and the Sunday rule.
 * Always dated and linked to the PGC digest.
 */
export function OpenToday({
  at = DEFAULT_AT,
  now = new Date(),
  species = allSpecies,
  lookup,
}: {
  at?: { lat: number; lng: number };
  now?: Date;
  species?: Species[];
  /** Today's row from the ingested PGC hunting-hours lookup, when available. */
  lookup?: HuntingHoursRow | null;
}) {
  const ymd = todayET(now);
  const zone = pgcHoursZone(at.lng);
  const sunday = weekdayOf(ymd) === 0;

  return (
    <View style={ui.card} testID="open-today">
      <Text style={styles.title}>Open today?</Text>
      <Text style={ui.muted}>
        {formatDay(ymd)}
        {sunday ? ' (Sunday)' : ''} · Hours for PGC zone {zone.zone}
        {zone.minutesPlus ? ` (+${zone.minutesPlus} min)` : ''}
      </Text>
      {species.map((sp) => {
        const status = speciesStatus(sp, ymd, at, lookup);
        const regs = regsFor(sp);
        return (
          <View key={sp} style={styles.row} testID={`open-today-${sp}`}>
            <View style={ui.row}>
              <Text style={styles.species}>{speciesLabel[sp]}</Text>
              {status.kind === 'open' && <Tag label={status.season.youth ? 'Youth' : 'Open'} tone="accent" />}
            </View>
            <Text style={[ui.body, status.kind === 'open' ? null : { color: colors.muted }]}>{describeStatus(status, now)}</Text>
            <Text style={ui.muted}>
              Daily {regs.daily} · Possession {regs.possession}
            </Text>
            <Text style={ui.muted}>{regs.sundayNote}</Text>
          </View>
        );
      })}
      <Text style={ui.muted} testID="open-today-asof">
        Regulations as of {formatDay(REGS.asOf)}, {REGS.asOf.slice(0, 4)} (v{REGS.version}). Entered by hand; the PGC digest is the
        final word.
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open the PGC Hunting & Trapping Digest"
        onPress={() => Linking.openURL(PGC_DIGEST_URL)}
        style={styles.link}
      >
        <Ionicons name="open-outline" size={16} color={colors.accent} />
        <Text style={styles.linkText}>PGC Hunting & Trapping Digest</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.headingSemi, fontSize: 22, color: colors.text },
  row: { gap: 2, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  species: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flex: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.sm },
  linkText: { color: colors.accent, fontFamily: fonts.bodySemi },
});
