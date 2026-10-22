import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TermsContent } from '@/components/TermsContent';
import { Button, Notice, ui } from '@/components/ui';
import { consentBullets, consentCheckboxLabel, consentTitle } from '@/data/terms';
import { acceptTerms } from '@/lib/termsConsent';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

/**
 * One-time acceptance gate before the first map view (memo 4C). Continue stays
 * disabled until the checkbox is ticked. Shown again when TERMS_VERSION changes.
 */
export function OnboardingConsent() {
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const onContinue = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await acceptTerms();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.lg }]} testID="onboarding-consent">
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title} accessibilityRole="header">
          {consentTitle}
        </Text>
        {consentBullets.map((b) => (
          <View key={b} style={styles.bullet}>
            <Text style={ui.body}>•</Text>
            <Text style={[ui.body, { flex: 1 }]}>{b}</Text>
          </View>
        ))}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={consentCheckboxLabel}
          accessibilityState={{ checked }}
          onPress={() => setChecked((v) => !v)}
          style={styles.check}
        >
          <View style={[styles.box, checked && styles.boxOn]}>
            {checked && <Ionicons name="checkmark" size={18} color={colors.onAccent} />}
          </View>
          <Text style={[ui.body, { flex: 1 }]}>{consentCheckboxLabel}</Text>
        </Pressable>

        <Text accessibilityRole="link" style={styles.link} onPress={() => setShowTerms((v) => !v)}>
          {showTerms ? 'Hide Terms of Service' : 'Read the Terms of Service'}
        </Text>
        {showTerms && <TermsContent />}

        {error && <Notice tone="error">{error}</Notice>}
        <Button label="Continue" variant="primary" disabled={!checked} busy={busy} onPress={onContinue} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  title: { fontFamily: fonts.heading, fontSize: 28, color: colors.text },
  bullet: { flexDirection: 'row', gap: space.sm },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touchTarget, paddingVertical: space.sm },
  box: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  link: { fontFamily: fonts.bodyMedium, color: colors.text, textDecorationLine: 'underline', minHeight: touchTarget, paddingVertical: space.sm },
});
