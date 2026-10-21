import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';
import { colors } from '@/theme/tokens';

// Diary first: Map · Diary (center, home) · Plan · Crew · More.
// The community feed lives inside Crew and is hidden from the bar.
export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="diary"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.ground } }}
    >
      <Tabs.Screen name="map" options={{ title: 'Map' }} />
      <Tabs.Screen name="diary" options={{ title: 'Diary' }} />
      {/* TODO(dev-2 feat/open-today-card): learn.tsx becomes plan.tsx; route name changes then. */}
      <Tabs.Screen name="learn" options={{ title: 'Plan' }} />
      <Tabs.Screen name="groups" options={{ title: 'Crew' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="feed" options={{ href: null, title: 'Community' }} />
    </Tabs>
  );
}
