import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { PrivacyPill } from '@/components/stats/parts';
import { Button, Notice, SectionTitle, ui } from '@/components/ui';
import { useJournal } from '@/data/hooks';
import { editJournalEntry, removeJournalEntry, type JournalEntry } from '@/data/journal';
import { coverLabel, speciesLabel } from '@/data/types';
import { formatDay } from '@/lib/time';
import { colors, fonts, profileBottomPad, space } from '@/theme/tokens';

import { birdsTotal, DiaryForm, diaryDraft, formValueFrom } from './new';

export const syncText = (e: JournalEntry) =>
  e.sync.status === 'synced'
    ? 'Backed up'
    : e.sync.conflict
      ? 'Conflict: changed elsewhere'
      : e.sync.status === 'failed'
        ? 'Not backed up yet · will retry'
        : 'Waiting to back up';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={ui.muted}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function DiaryEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, retry } = useJournal();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const e = data?.find((x) => x.id === id);

  if (!e) {
    return (
      <View style={styles.root}>
        <ScreenHeader back title="Diary entry" />
        <View style={styles.body}>{!loading && <Notice>That entry isn’t on this device.</Notice>}</View>
      </View>
    );
  }
  const d = e.details;
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader back title={e.huntedOn ? formatDay(e.huntedOn) : 'Diary entry'} right={<PrivacyPill testID="page-privacy" />} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View accessibilityLabel={`Sync status: ${syncText(e)}`}>
          <Notice tone={e.sync.status === 'failed' ? 'error' : e.sync.status === 'synced' ? 'success' : 'info'}>{syncText(e)}</Notice>
        </View>
        {e.sync.conflict && <Text style={ui.muted}>{e.sync.error}</Text>}
        {e.sync.status === 'failed' && !e.sync.conflict && <Button label="Retry backup now" icon="refresh" onPress={() => void retry()} />}

        {editing ? (
          <DiaryForm
            initial={formValueFrom(e)}
            submitLabel="Save changes"
            onSubmit={async (v) => {
              const { draft, details } = diaryDraft(v);
              await editJournalEntry(e.id, { species: draft.species, caption: draft.caption, huntedOn: draft.huntedOn, counts: draft.counts, details });
              setEditing(false);
            }}
          />
        ) : (
          <>
            {e.placeCounts?.[0] && <Row label="Place" value={e.placeCounts[0].placeName} />}
            {d?.startTime && <Row label="Start" value={d.startTime} />}
            {d?.species.length ? <Row label="Species" value={d.species.map((s) => speciesLabel[s]).join(', ')} /> : null}
            {d?.cover.length ? <Row label="Cover" value={d.cover.map((c) => coverLabel[c]).join(', ')} /> : null}
            {d && (
              <Row
                label="Effort"
                value={[d.hours !== null ? `${d.hours} h` : null, d.miles !== null ? `${d.miles} mi` : null, `${d.flushes} flushes`, `${d.shots} shots`]
                  .filter(Boolean)
                  .join(' · ')}
              />
            )}
            {d?.birds.length ? (
              <Row
                label="Birds"
                value={`${birdsTotal(d.birds)} · ${d.birds
                  .map((b) => `${speciesLabel[b.species]} ${b.count}${b.species === 'pheasant' ? ` (${b.roosters ?? 0} roosters, ${b.hens ?? 0} hens)` : ''}`)
                  .join(', ')}`}
              />
            ) : null}
            {d?.dogs.length ? (
              <>
                <SectionTitle>Dogs</SectionTitle>
                {d.dogs.map((g) => (
                  <Row key={g.dogId} label={g.name} value={`${g.points} points · ${g.flushes} flushes · ${g.retrieves} retrieves`} />
                ))}
              </>
            ) : null}
            {d?.weather && (
              <Row
                label="Weather"
                value={[d.weather.tempF !== null ? `${d.weather.tempF}°F` : null, d.weather.windMph !== null ? `wind ${d.weather.windMph} mph ${d.weather.windDir ?? ''}`.trim() : null, d.weather.sky]
                  .filter(Boolean)
                  .join(' · ')}
              />
            )}
            {e.caption ? <Text style={ui.body}>{e.caption}</Text> : null}
            {d?.photos.length ? <Row label="Photos" value={`${d.photos.length} private`} /> : null}
            <Button label="Edit entry" icon="create-outline" onPress={() => setEditing(true)} />
            {!confirmDelete ? (
              <Button label="Delete entry" icon="trash-outline" variant="danger" onPress={() => setConfirmDelete(true)} />
            ) : (
              <>
                <Notice tone="error">Deletes this entry from this device and from your account backup.</Notice>
                <Button
                  label="Yes, delete entry"
                  variant="danger"
                  onPress={async () => {
                    await removeJournalEntry(e.id);
                    if (router.canGoBack()) router.back();
                    else router.replace('/profile/hunt-log');
                  }}
                />
                <Button label="Keep it" onPress={() => setConfirmDelete(false)} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: profileBottomPad, gap: space.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: space.xs },
  value: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flexShrink: 1, textAlign: 'right' },
});
