import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { LegalLinks } from '@/components/LegalLinks';
import { Button, Notice, SectionTitle, ui } from '@/components/ui';
import { MIN_AGE } from '@/lib/env';
import { readAgeGate, writeAgeGate, type AgeGateStatus } from '@/lib/localStore';
import { colors, space } from '@/theme/tokens';

/** Age this calendar year; the person may not have had their birthday yet. */
export function ageFromBirthYear(year: number, now = new Date()) {
  return now.getFullYear() - year;
}

/**
 * 13+ age gate. Asks for birth year once per device; under-13 is remembered
 * and stays blocked. Renders children only after the gate is passed.
 */
export function AgeGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AgeGateStatus | 'loading'>('loading');
  const [year, setYear] = useState('');

  useEffect(() => {
    readAgeGate().then(setStatus);
  }, []);

  if (status === 'loading') return null;
  if (status === 'passed') return <>{children}</>;
  if (status === 'blocked') {
    return (
      <View style={styles.body}>
        <Notice tone="error">Sorry, you must be {MIN_AGE} or older to use BirdBrain.</Notice>
        <LegalLinks />
      </View>
    );
  }

  const n = Number(year);
  const thisYear = new Date().getFullYear();
  const valid = /^\d{4}$/.test(year) && n > thisYear - 120 && n <= thisYear;

  const submit = async () => {
    // Conservative: someone born in (thisYear - 13) may not have turned 13 yet.
    const next = ageFromBirthYear(n) > MIN_AGE ? 'passed' : 'blocked';
    await writeAgeGate(next);
    setStatus(next);
  };

  return (
    <View style={styles.body}>
      <SectionTitle>Before you start</SectionTitle>
      <Text style={ui.body}>BirdBrain is for hunters {MIN_AGE} and older. What year were you born?</Text>
      <TextInput
        value={year}
        onChangeText={(t) => setYear(t.replace(/\D/g, '').slice(0, 4))}
        placeholder="YYYY"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        style={ui.input}
        accessibilityLabel="Birth year"
      />
      <Button label="Continue" variant="primary" disabled={!valid} onPress={submit} />
      <LegalLinks />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
});
