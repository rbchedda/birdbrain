import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';
import { colors } from '@/theme/tokens';

// Map (launch) | Feed | ＋ New | Guide | Profile.
// The center ＋ is not a tab: TabBar renders it and it opens the /new chooser modal.
export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.ground } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Map' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="guide" options={{ title: 'Guide' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
