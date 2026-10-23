import { EntitlementsProvider, UpgradeSheet } from '@/entitlements';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConsentGate } from '@/components/ConsentGate';
import { FieldToasts } from '@/components/FieldSync';
import { startPlansSyncOnce } from '@/data/hooks';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // Plans: push the offline queue and pull own + crew-shared plans (no-op while signed out).
  useEffect(startPlansSyncOnce, []);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <EntitlementsProvider>
        <StatusBar style="light" />
        {/* Consent first: nothing (including the upgrade sheet) shows until terms are accepted. */}
        <ConsentGate>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
            <Stack.Screen
              name="new/index"
              options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
            />
          </Stack>
          <UpgradeSheet />
          <FieldToasts />
        </ConsentGate>
      </EntitlementsProvider>
    </SafeAreaProvider>
  );
}
