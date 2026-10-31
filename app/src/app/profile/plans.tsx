import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { PrivacyPill } from '@/components/stats/parts';
import { SignInPrompt } from '@/components/SignInPrompt';
import { PlansSection } from '@/components/spot/PlansSection';
import { useSession } from '@/data/hooks';
import { colors, profileBottomPad, space } from '@/theme/tokens';

/** Profile › Plans: upcoming hunt plans, with Past plans one tap away. Signed-in only, like the plans themselves. */
export default function PlansScreen() {
  const session = useSession();
  return (
    <View style={styles.root}>
      <ScreenHeader back backFallback="/profile" title="Plans" right={<PrivacyPill testID="page-privacy" />} />
      <ScrollView contentContainerStyle={styles.body}>
        {session ? (
          <View style={styles.pad}>
            <PlansSection owner={session.userId} title={false} />
          </View>
        ) : (
          session === null && <SignInPrompt why="Sign in to plan hunts. Your plans are backed up to your account and only you (and a crew you share with) can see them." />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingBottom: profileBottomPad },
  pad: { paddingHorizontal: space.lg },
});
