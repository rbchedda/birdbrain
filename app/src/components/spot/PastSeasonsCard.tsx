import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrivacyPill } from '@/components/stats/parts';
import { useJournal, useSession } from '@/data/hooks';
import { entriesForAccount, OWNER_KEY, type JournalEntry } from '@/data/journal';
import { pastSeasonsForPlace, type PastSeasonsSummary } from '@/data/pastSeasons';
import { readJson } from '@/lib/localStore';
import { formatDay, todayET, type Ymd } from '@/lib/time';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * "This week in past seasons" for a spot or Plan — private, on-device journal only.
 * Hidden when signed out. Empty state when the signed-in user has no matching hunts.
 */
export function usePastSeasonsSummary(placeId: string | undefined, reference: Ymd): PastSeasonsSummary | null {
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

  return useMemo(() => {
    if (!session?.userId || !placeId) return null;
    const mine: JournalEntry[] = entriesForAccount(data ?? [], session.userId, guestOwner);
    return pastSeasonsForPlace(mine, placeId, reference);
  }, [session?.userId, placeId, reference, data, guestOwner]);
}

export function PastSeasonsCard({
  placeId,
  reference,
  testID = 'past-seasons-card',
}: {
  placeId: string;
  /** Calendar day the week is centered on (plan date, or today on the spot sheet). */
  reference?: Ymd;
  testID?: string;
}) {
  const ref = reference ?? todayET();
  const summary = usePastSeasonsSummary(placeId, ref);
  if (!summary) return null;
  return <PastSeasonsCardView summary={summary} testID={testID} />;
}

/** Pure view for tests and screenshots — no hooks. */
export function PastSeasonsCardView({
  summary,
  testID = 'past-seasons-card',
}: {
  summary: PastSeasonsSummary;
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID} accessibilityLabel="This week in past seasons">
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          This week in past seasons
        </Text>
        <PrivacyPill testID={`${testID}-privacy`} label="Only you can see this history" />
      </View>
      <Text style={styles.sub} testID={`${testID}-window`}>
        Same calendar week as {formatDay(summary.reference)} · prior seasons only
      </Text>

      {summary.empty ? (
        <View style={styles.empty} testID={`${testID}-empty`}>
          <Text style={styles.emptyTitle}>No history for this week yet</Text>
          <Text style={styles.body}>{summary.note}</Text>
          <Text style={styles.fine}>Log hunts here and next season this card fills in. Nothing is invented.</Text>
        </View>
      ) : (
        <>
          <View style={styles.tiles} testID={`${testID}-tiles`}>
            <Tile label="Hunts" value={String(summary.huntCount)} testID={`${testID}-hunts`} />
            <Tile label="Flushes" value={String(summary.flushes)} testID={`${testID}-flushes`} />
            <Tile label="Birds" value={String(summary.harvest)} testID={`${testID}-harvest`} />
            <Tile label="Seasons" value={String(summary.seasons)} testID={`${testID}-seasons`} />
          </View>
          <Text style={styles.note} testID={`${testID}-note`}>
            {summary.note}
          </Text>
          {summary.bestTime && (
            <View style={styles.hint} testID={`${testID}-best-time`}>
              <Text style={styles.hintLabel}>Best time of day</Text>
              <Text style={styles.hintValue}>{summary.bestTime.label}</Text>
              <Text style={styles.fine}>From {summary.bestTime.sample} hunts with a start time · flush rate</Text>
            </View>
          )}
          {summary.bestWeather && (
            <View style={styles.hint} testID={`${testID}-best-weather`}>
              <Text style={styles.hintLabel}>Weather on your best day</Text>
              <Text style={styles.hintValue}>{summary.bestWeather.text}</Text>
              <Text style={styles.fine}>Highest flushes among {summary.bestWeather.sample} hunts with weather</Text>
            </View>
          )}
          {!summary.bestTime && !summary.bestWeather && (
            <Text style={styles.fine} testID={`${testID}-no-hint`}>
              Best-time hints need at least 3 hunts with a start time or weather. Keep logging.
            </Text>
          )}
        </>
      )}
      <Text style={styles.fine} testID={`${testID}-disclaimer`}>
        Your private log only · history, not a forecast
      </Text>
    </View>
  );
}

function Tile({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  title: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  sub: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: {
    flex: 1,
    gap: 2,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.tile,
    alignItems: 'center',
  },
  tileValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  tileLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  hint: { gap: 2, paddingTop: space.xs },
  hintLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.dove },
  hintValue: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  empty: { gap: space.xs, paddingVertical: space.xs },
  emptyTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.subtle },
  fine: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted },
});
