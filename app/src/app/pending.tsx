import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSignal } from '@/components/FieldSync';
import { ScreenHeader } from '@/components/Screen';
import { Button, ui } from '@/components/ui';
import { onJournalChange, type JournalEntry } from '@/data/journal';
import { copy, pendingHunts } from '@/lib/fieldDraft';
import { formatDay } from '@/lib/time';
import { colors, space } from '@/theme/tokens';

/** Spec 07: every hunt still on this phone, each "Waiting to sync". One sign-in syncs all of them. */
export default function PendingScreen() {
  const signal = useSignal();
  const [list, setList] = useState<JournalEntry[]>([]);
  const load = useCallback(() => void pendingHunts().then(setList), []);
  useEffect(() => {
    load();
    return onJournalChange(load);
  }, [load]);
  return (
    <View style={styles.root}>
      <ScreenHeader title="Hunts on this phone" back />
      <ScrollView contentContainerStyle={styles.body}>
        {list.map((e) => (
          <View key={e.id} style={ui.card} testID={`pending-${e.clientId}`}>
            <Text style={styles.title}>
              {e.caption || e.placeCounts?.[0]?.placeName || 'Hunt'}
              {e.huntedOn ? ` · ${formatDay(e.huntedOn)}` : ''}
            </Text>
            <Text style={styles.status}>{copy.waiting}</Text>
          </View>
        ))}
        {!list.length && <Text style={ui.muted}>Nothing waiting. Every hunt is backed up.</Text>}
      </ScrollView>
      {!!list.length && (
        <View style={styles.bar}>
          <Button
            label={signal.online ? 'Sign in to sync' : copy.noSignal}
            variant="primary"
            disabled={!signal.online}
            onPress={() => router.push({ pathname: '/new/log', params: { signin: '1' } })}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { padding: space.lg, gap: space.sm },
  title: { color: '#F2F4EF', fontSize: 16, fontWeight: '600' },
  status: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  bar: { padding: space.lg },
});
