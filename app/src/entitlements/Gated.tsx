import { type ReactNode, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button, ui } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme/tokens';

import { PLACEHOLDER_PRICE_NOTE, PRODUCTS } from './config';
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
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      showUpgrade(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setBusy(false);
    }
  };
  const season = PRODUCTS.season_pass_yearly;
  const weekend = PRODUCTS.weekend_pass;
  return (
    <Modal visible={upgradeFor !== null} transparent animationType="slide" onRequestClose={() => showUpgrade(null)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="upgrade-sheet">
          <Text style={styles.title}>Upgrade BirdBrain</Text>
          {upgradeFor && <Text style={ui.muted}>{FEATURE_LABEL[upgradeFor]} needs a pass.</Text>}
          <Text style={ui.body}>Safety info (boundaries, access, hours, regs) is always free.</Text>
          <Text style={styles.title}>{season.title}: {season.price.display}</Text>
          {season.introOffer && (
            <Text style={ui.body}>
              {season.introOffer.label}: {season.introOffer.price.display}
            </Text>
          )}
          <Button label={`Get ${season.title}`} variant="primary" busy={busy} onPress={run(() => purchase(season.id))} />
          <Text style={styles.title}>{weekend.title}: {weekend.price.display}</Text>
          <Text style={ui.muted}>{weekend.durationHours} hours of premium, does not renew.</Text>
          <Button label={`Get ${weekend.title}`} busy={busy} onPress={run(() => purchase(weekend.id))} />
          <Button label="Restore purchases" busy={busy} onPress={run(restore)} />
          <Text style={styles.placeholder} testID="price-placeholder">
            {PLACEHOLDER_PRICE_NOTE}
            {provider.name === 'mock' ? ' Dev mock store: no real charge.' : ''}
          </Text>
          {error && <Text style={{ color: colors.danger }}>{error}</Text>}
          <Button label="Not now" onPress={() => showUpgrade(null)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  locked: { gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  title: { fontFamily: fonts.headingSemi, fontSize: 17, color: colors.text },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { gap: space.sm, padding: space.lg, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  placeholder: { fontFamily: fonts.bodySemi, color: colors.dove },
});
