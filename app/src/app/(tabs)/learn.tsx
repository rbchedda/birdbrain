import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { Tag } from '@/components/Tag';
import { SectionTitle, ui } from '@/components/ui';
import { SEASON_YEAR, seasons, seasonWindows, sundayClosed } from '@/data/seasons';
import { todayET } from '@/lib/time';
import { colors, fonts, space } from '@/theme/tokens';

export default function LearnScreen() {
  const today = todayET();
  return (
    <View style={styles.root}>
      <ScreenHeader title="Learn" subtitle={`${SEASON_YEAR} seasons, hours and how BirdBrain keeps spots private`} />
      <ScrollView contentContainerStyle={styles.body}>
        <SectionTitle>Seasons</SectionTitle>
        {seasons.map((s) => {
          const windows = seasonWindows(s, today);
          return (
            <View key={s.label} style={ui.card}>
              <View style={ui.row}>
                <Text style={styles.name}>{s.label}</Text>
                {windows.some((w) => w.current) && <Tag label="Open now" tone="accent" />}
              </View>
              {windows.length ? (
                windows.map((w) => (
                  <Text key={w.label} style={[ui.body, w.past && { color: colors.muted }]}>
                    {w.label}
                  </Text>
                ))
              ) : (
                <Text style={ui.body}>Dates vary by zone.</Text>
              )}
              <Text style={ui.muted}>
                {sundayClosed(s.species) ? 'No Sunday hunting. ' : 'Sundays included. '}
                {s.note}
              </Text>
            </View>
          );
        })}

        <SectionTitle>Legal hours</SectionTitle>
        <Text style={ui.body}>
          Small game, including pheasant, grouse and dove: ½ hour before sunrise to sunset. Spring gobbler: ½ hour before
          sunrise to noon early in the season. The map computes sunrise and sunset for each spot.
        </Text>

        <SectionTitle>Sharing without burning your spot</SectionTitle>
        <Text style={ui.body}>
          • Posts are delayed: others see them from midnight Eastern the day after you share, and never
          sooner than 12 hours after. PA law bars using phones to
          alert another hunter to live game.{'\n'}• Others only see a ~5 km area, never your spot. Which places you
          hunted and your per-place counts are visible to you alone.{'\n'}• Private log entries never leave your phone.
          {'\n'}• Block or report anyone from their post, comment or profile.
        </Text>

        <Text style={[ui.muted, { marginTop: space.lg }]}>
          Statewide dates as approved by the Pennsylvania Game Commission. WMU, zone and bag rules vary; the PGC Hunting &
          Trapping Digest is the final word. BirdBrain is not affiliated with the PGC.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  name: { fontFamily: fonts.headingSemi, fontSize: 20, color: colors.text, flex: 1 },
});
