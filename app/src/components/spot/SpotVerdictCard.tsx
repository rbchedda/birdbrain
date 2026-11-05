import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useJournal, useSession } from '@/data/hooks';
import { entriesForAccount, OWNER_KEY } from '@/data/journal';
import { readJson } from '@/lib/localStore';
import {
  computeSpotVerdict,
  crewMaySeeVerdict,
  verdictFromSnapshot,
  verdictShareActionsAllowed,
  type DotKind,
  type SpotVerdict,
  type SpotVerdictSnapshot,
  type VerdictPlace,
  type VerdictWord,
} from '@/data/spotVerdict';
import type { Species } from '@/data/types';
import { speciesLabel } from '@/data/types';
import { formatDay, type Ymd } from '@/lib/time';
import { colors, fonts, radius, space } from '@/theme/tokens';

const WORD_ICON: Record<VerdictWord, string> = {
  Closed: '✕',
  'New to you': '○',
  Slow: '▼',
  Mixed: '◆',
  Productive: '▲',
};

function Dot({ kind }: { kind: DotKind }) {
  const label =
    kind === 'productive'
      ? 'productive hunt'
      : kind === 'mixed'
        ? 'mixed hunt'
        : kind === 'slow'
          ? 'slow hunt'
          : kind === 'zero'
            ? 'no flushes'
            : 'hours unknown';
  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.dot,
        kind === 'productive' && styles.dotProductive,
        kind === 'mixed' && styles.dotMixed,
        kind === 'slow' && styles.dotSlow,
        kind === 'zero' && styles.dotZero,
        kind === 'no_hours' && styles.dotNoHours,
      ]}
      testID={`verdict-dot-${kind}`}
    />
  );
}

export function SpotVerdictCardView({
  verdict,
  testID = 'spot-verdict',
}: {
  verdict: SpotVerdict;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const honest = verdict.audience === 'crew' ? verdict.crewHonestLine : verdict.honestLine;
  const a11y = `${verdict.word}. ${verdict.line}. ${honest ?? ''}`;
  const canShare = verdictShareActionsAllowed(verdict.audience);

  return (
    <View style={styles.card} testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint="Shows your last hunts that make this verdict"
        onPress={() => setOpen((v) => !v)}
        style={styles.chipTarget}
        testID={`${testID}-chip`}
      >
        <View style={[styles.chip, chipTone(verdict.word)]}>
          <Text style={styles.chipIcon}>{WORD_ICON[verdict.word]}</Text>
          <Text style={styles.chipWord}>{verdict.word}</Text>
        </View>
        <Text style={styles.line}>{verdict.line}</Text>
        {!!verdict.stockingLine && (
          <Text style={styles.stocking} testID={`${testID}-stocking`}>
            {verdict.stockingLine}
          </Text>
        )}
        {!!honest && (
          <Text style={styles.honest} testID={`${testID}-honest`}>
            {honest}
          </Text>
        )}
        {verdict.frozen && (
          <Text style={styles.frozen} testID={`${testID}-frozen`}>
            Frozen for hunt day
          </Text>
        )}
        <View style={styles.dots} testID={`${testID}-dots`}>
          {verdict.dots.map((d, i) => (
            <Dot key={i} kind={d} />
          ))}
        </View>
      </Pressable>

      {open && (
        <View style={styles.why} testID={`${testID}-why`}>
          <Text style={styles.whyTitle}>Why this verdict</Text>
          {verdict.visits.length === 0 ? (
            <Text style={styles.muted}>No hunts in the window yet.</Text>
          ) : (
            verdict.visits.map((v) => (
              <View key={v.entry.id} style={styles.whyRow} testID={`${testID}-why-row`}>
                <Dot kind={v.dot} />
                <Text style={styles.whyText}>
                  {formatDay(v.entry.huntedOn as Ymd)}
                  {' · '}
                  {v.entry.details?.species?.map((s) => speciesLabel[s]).join(', ') ||
                    (v.entry.species ? speciesLabel[v.entry.species] : 'Hunt')}
                  {' · '}
                  {v.flushes} flushes
                  {v.hours != null ? ` · ${v.hours}h` : ' · hours n/a'}
                  {v.rate != null ? ` · ${v.rate.toFixed(1)}/h` : ''}
                  {v.multiPlace ? ' · multi-place' : ''}
                </Text>
              </View>
            ))
          )}
          <Text style={styles.muted}>Your own past results. Bird numbers change with stocking, weather and pressure.</Text>
        </View>
      )}

      {/* Crew: no share / export / screenshot-share. Owner also never gets a share control here. */}
      {canShare ? <Text testID={`${testID}-share`}>Share</Text> : null}
    </View>
  );
}

function chipTone(word: VerdictWord) {
  if (word === 'Productive') return styles.chipProductive;
  if (word === 'Mixed') return styles.chipMixed;
  if (word === 'Slow' || word === 'New to you' || word === 'Closed') return styles.chipOutline;
  return null;
}

/** Owner live verdict for a place (spot sheet / own plan). */
export function SpotVerdictCard({
  place,
  reference,
  species,
  testID,
}: {
  place: VerdictPlace;
  reference: Ymd;
  species?: Species[];
  testID?: string;
}) {
  const session = useSession();
  const { data } = useJournal();
  const [guestOwner, setGuestOwner] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void readJson<string | null>(OWNER_KEY, null).then((o) => {
      if (live) setGuestOwner(o);
    });
    return () => {
      live = false;
    };
  }, [session?.userId]);
  const verdict = useMemo(() => {
    if (!session?.userId || !place) return null;
    const mine = entriesForAccount(data ?? [], session.userId, guestOwner);
    return computeSpotVerdict({
      place,
      entries: mine,
      reference,
      species,
      audience: 'owner',
    });
  }, [session?.userId, place, reference, species, data, guestOwner]);
  if (!session?.userId || !verdict) return null;
  return <SpotVerdictCardView verdict={verdict} testID={testID} />;
}

/**
 * Crew-facing verdict for a shared Plan. Hidden unless the owner opted in
 * and a snapshot is present. No share / export / screenshot-share.
 */
export function CrewSpotVerdictCard({
  snapshot,
  showToCrew,
  testID = 'crew-spot-verdict',
}: {
  snapshot: SpotVerdictSnapshot | null | undefined;
  showToCrew: boolean;
  testID?: string;
}) {
  if (!crewMaySeeVerdict(showToCrew) || !snapshot) return null;
  return <SpotVerdictCardView verdict={verdictFromSnapshot(snapshot)} testID={testID} />;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.sm,
  },
  chipTarget: { gap: 6, minHeight: 56, justifyContent: 'center' },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipProductive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipMixed: { backgroundColor: colors.dove, borderColor: colors.dove },
  chipOutline: { backgroundColor: 'transparent' },
  chipIcon: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  chipWord: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  line: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  stocking: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  honest: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  frozen: { fontFamily: fonts.body, fontSize: 11, color: colors.dove },
  dots: { flexDirection: 'row', gap: 6, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.accent },
  dotProductive: { backgroundColor: colors.accent },
  dotMixed: { backgroundColor: colors.dove, borderColor: colors.dove },
  dotSlow: { backgroundColor: 'transparent' },
  dotZero: { backgroundColor: 'transparent', borderStyle: 'solid' },
  dotNoHours: { backgroundColor: 'transparent', borderStyle: 'dashed' as never },
  why: { gap: 6, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  whyTitle: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  whyText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
  muted: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});
