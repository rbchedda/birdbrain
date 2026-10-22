import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ui } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme/tokens';

import { legal } from '@/lib/env';

import { DISCLOSURE, PLACEHOLDER_PRICE_NOTE, PRODUCTS } from './config';
import { useEntitlements } from './EntitlementsContext';
import { isSafetyFeature, type Feature } from './features';

const FEATURE_LABEL: Partial<Record<Feature, string>> = {
  stockingCalendar: 'Full stocking calendar',
  stockingAlerts: 'Stocking alerts',
  unlimitedSavedSpots: 'Unlimited saved spots',
  multiYearStats: 'Multi-year stats',
  offlineMaps: 'Offline maps',
  autoWeather: 'Auto weather',
  export: 'Export',
  multiDog: 'Multiple dogs',
  premiumRecap: 'Premium season recap',
};

/** Renders children if the feature is usable, otherwise a locked card. Safety features always render. */
export function Gated({ feature, children, fallback }: { feature: Feature; children: ReactNode; fallback?: ReactNode }) {
  const { canUse, showUpgrade } = useEntitlements();
  if (isSafetyFeature(feature) || canUse(feature)) return <>{children}</>;
  return (
    fallback ?? (
      <View style={styles.locked} testID={`gated-${feature}`}>
        <Text style={styles.title}>{FEATURE_LABEL[feature] ?? 'Season Pass feature'}</Text>
        <Text style={ui.muted}>Included with Season Pass or Weekend Pass.</Text>
        <Button label="See passes" icon="lock-open-outline" onPress={() => showUpgrade(feature)} />
      </View>
    )
  );
}

export function UpgradeSheet() {
  const { upgradeFor, showUpgrade, purchase, restore, provider } = useEntitlements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      await fn();
      showUpgrade(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed');
      setNeedsSignIn(e instanceof Error && e.name === 'AccountRequiredError');
    } finally {
      setBusy(false);
    }
  };
  const season = PRODUCTS.season_pass_yearly;
  const weekend = PRODUCTS.weekend_pass;
  return (
    <Modal visible={upgradeFor !== null} transparent animationType="slide" onRequestClose={() => showUpgrade(null)}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheet} testID="upgrade-sheet">
          <Text style={styles.title}>Upgrade BirdBrain</Text>
          {upgradeFor && <Text style={ui.muted}>{FEATURE_LABEL[upgradeFor]} needs a pass.</Text>}
          <Text style={ui.body}>Safety info (boundaries, access, hours, regs) is always free.</Text>
          {provider.name === 'unavailable' ? (
            <Text style={ui.body} testID="passes-coming-soon">Passes coming soon.</Text>
          ) : (
            <>
              <Text style={styles.title}>{season.title}: {season.price.display}</Text>
              {season.introOffer && (
                <Text style={ui.body}>
                  {season.introOffer.label}: {season.introOffer.price.display}
                </Text>
              )}
              <Button label={`Get ${season.title}`} variant="primary" busy={busy} onPress={run(() => purchase(season.id))} />
              <Text style={styles.fine} testID="disclosure-season">
                {DISCLOSURE.seasonAutoRenew(season.price.display)}
                {season.introOffer ? ` ${DISCLOSURE.introOffer(season.introOffer.price.display, season.price.display)}` : ''}
              </Text>
              <Text style={styles.title}>{weekend.title}: {weekend.price.display}</Text>
              <Button label={`Get ${weekend.title}`} busy={busy} onPress={run(() => purchase(weekend.id))} />
              <Text style={styles.fine} testID="disclosure-weekend">
                {DISCLOSURE.weekendNonRenewing(weekend.durationHours ?? 72, weekend.price.display)}
              </Text>
              <Button label="Restore purchases" busy={busy} onPress={run(restore)} />
              <Text style={styles.placeholder} testID="price-placeholder">
                {PLACEHOLDER_PRICE_NOTE}
                {provider.name === 'mock' ? ' Dev mock store: no real charge.' : ''}
              </Text>
            </>
          )}
          <View style={styles.links}>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(legal.termsUrl).catch(() => {})}>
              <Text style={styles.link}>Terms of Service</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(legal.privacyPolicyUrl).catch(() => {})}>
              <Text style={styles.link}>Privacy Policy</Text>
            </Pressable>
          </View>
          {error && <Text style={{ color: colors.danger }}>{error}</Text>}
          {needsSignIn && (
            <Button label="Sign in or create an account" variant="primary" onPress={() => { showUpgrade(null); router.push('/sign-in'); }} />
          )}
          <Button label="Not now" onPress={() => showUpgrade(null)} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  locked: { gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  title: { fontFamily: fonts.headingSemi, fontSize: 17, color: colors.text },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetScroll: { maxHeight: '90%', flexGrow: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  fine: { fontSize: 12, color: colors.muted },
  links: { flexDirection: 'row', gap: space.lg },
  link: { color: colors.accent, fontFamily: fonts.bodySemi },
  sheet: { gap: space.sm, padding: space.lg, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  placeholder: { fontFamily: fonts.bodySemi, color: colors.dove },
});
