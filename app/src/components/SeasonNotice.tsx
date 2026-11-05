import { View } from 'react-native';

import { Notice } from '@/components/ui';
import { currentSeason, displaySeasonSet, unpublishedLine } from '@/data/seasonRegistry';
import { todayET, type Ymd } from '@/lib/time';

/**
 * Shown wherever season rules are listed when the date's season year isn't in the SEASONS
 * registry: says which season the listed rules are from and that this year's aren't published.
 * Renders nothing for a published season.
 */
export function seasonNoticeText(ymd: Ymd = todayET()): string | null {
  const cur = currentSeason(ymd);
  if (cur.kind === 'known') return null;
  return `Rules shown are from ${displaySeasonSet(ymd).label}. ${unpublishedLine(cur.year)}`;
}

export function SeasonUnpublishedNotice({ ymd = todayET(), testID = 'season-unpublished' }: { ymd?: Ymd; testID?: string }) {
  const text = seasonNoticeText(ymd);
  if (!text) return null;
  return (
    <View testID={testID}>
      <Notice>{text}</Notice>
    </View>
  );
}
