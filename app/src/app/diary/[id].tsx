import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { PrivacyPill } from '@/components/stats/parts';
import { Button, Notice, SectionTitle, ui } from '@/components/ui';
import { backend } from '@/data';
import { useJournal, useSession } from '@/data/hooks';
import { editJournalEntry, removeJournalEntry, type JournalEntry } from '@/data/journal';
import type { Crew, DiaryShareStatus } from '@/data/types';
import { coverLabel, speciesLabel } from '@/data/types';
import {
  DIARY_SHARE_DEFAULT_TTL_DAYS,
  DIARY_SHARE_MAX_TTL_DAYS,
  DIARY_SHARE_PHOTO_WARNING,
  DIARY_SHARE_TTL_OPTIONS,
  DIARY_SHARE_VIEW_COUNT_DISCLOSE,
  diaryShareExpiringSoon,
  diaryShareUrl,
  formatViewedTimes,
  shareDiaryLink,
} from '@/lib/diaryShare';
import { flags } from '@/lib/flags';
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

const emptyStatus = (): DiaryShareStatus => ({
  shared: false,
  linkId: null,
  createdAt: null,
  expiresAt: null,
  liveAt: null,
  audience: null,
  crewId: null,
  viewCount: 0,
});

/** Share / revoke controls for one diary entry. Token is kept in component state only (re-copy after create). */
export function DiarySharePanel({ clientId, synced, hasPhotos }: { clientId: string; synced: boolean; hasPhotos: boolean }) {
  const session = useSession();
  const [status, setStatus] = useState<DiaryShareStatus>(emptyStatus);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [crewId, setCrewId] = useState<string | null>(null);
  const [ttlDays, setTtlDays] = useState(DIARY_SHARE_DEFAULT_TTL_DAYS);

  const refresh = useCallback(async () => {
    if (!session) {
      setStatus(emptyStatus());
      return;
    }
    try {
      const s = await backend.diaryShareStatus(clientId);
      setStatus(s);
      if (!s.shared) setToken(null);
    } catch {
      // Keep last known; status is best-effort.
    }
  }, [clientId, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session) return;
    void backend.myCrews().then((list) => {
      setCrews(list);
      setCrewId((prev) => prev ?? list[0]?.id ?? null);
    });
  }, [session]);

  if (!session) return null;

  const shared = status.shared;
  const showViews = flags.shareLinkViewCounts && shared;

  const openSheet = () => {
    if (!synced) {
      setError('Back up this entry before sharing a link.');
      return;
    }
    setError(null);
    setTtlDays(DIARY_SHARE_DEFAULT_TTL_DAYS);
    setSheetOpen(true);
  };

  const onCreate = async () => {
    if (!synced) {
      setError('Back up this entry before sharing a link.');
      setSheetOpen(false);
      return;
    }
    if (!crewId) {
      setError('Join or create a crew before sharing.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ttl = Math.max(1, Math.min(ttlDays, DIARY_SHARE_MAX_TTL_DAYS));
      const link = await backend.createDiaryShareLink(clientId, crewId, ttl);
      setToken(link.token);
      setSheetOpen(false);
      await refresh();
      await shareDiaryLink(link.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create share link.');
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!token) return;
    setError(null);
    await shareDiaryLink(token);
  };

  const onRevoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await backend.revokeDiaryShareLink(clientId);
      setToken(null);
      setConfirmRevoke(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke share link.');
    } finally {
      setBusy(false);
    }
  };

  const chipLabel = () => {
    if (!shared) return '🔒 Private · only you';
    const live = status.liveAt ? formatDay(status.liveAt.slice(0, 10)) : null;
    const parts = ['🔗 Shared with crew'];
    if (live) parts.push(`live ${live}`);
    return parts.join(' · ');
  };

  return (
    <View style={styles.share} testID="diary-share-panel">
      <SectionTitle>Share link</SectionTitle>
      <View testID={shared ? 'diary-share-active' : 'diary-share-private'}>
        <Notice tone="info">{chipLabel()}</Notice>
      </View>
      {shared && status.expiresAt ? (
        <Text style={ui.muted} testID="diary-share-expires">
          Expires {formatDay(status.expiresAt.slice(0, 10))}
          {showViews ? ` · ${formatViewedTimes(status.viewCount)}` : ''}
        </Text>
      ) : null}
      {showViews && !status.expiresAt ? (
        <Text style={ui.muted} testID="diary-share-views">
          {formatViewedTimes(status.viewCount)}
        </Text>
      ) : null}
      {shared && diaryShareExpiringSoon(status.expiresAt) ? (
        <View testID="diary-share-expiry-reminder">
          <Notice tone="error">
            This link expires soon. Stop sharing or create a new link if you still want it available.
          </Notice>
        </View>
      ) : null}
      {token ? (
        <Text style={ui.muted} selectable testID="diary-share-url">
          {diaryShareUrl(token)}
        </Text>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!shared ? (
        <Button
          label="Share…"
          icon="share-outline"
          onPress={openSheet}
          disabled={busy}
          testID="diary-share-create"
        />
      ) : (
        <>
          {token ? (
            <Button label="Copy link" icon="copy-outline" onPress={() => void onCopy()} testID="diary-share-copy" />
          ) : (
            <Button label="Share again…" icon="share-outline" onPress={openSheet} disabled={busy} testID="diary-share-rotate" />
          )}
          {!confirmRevoke ? (
            <Button label="Stop sharing" icon="link-outline" variant="danger" onPress={() => setConfirmRevoke(true)} testID="diary-share-revoke" />
          ) : (
            <>
              <Notice tone="error">Stopping sharing turns the link off, but copies people already saved can&apos;t be pulled back.</Notice>
              <Button label="Yes, stop sharing" variant="danger" onPress={() => void onRevoke()} disabled={busy} testID="diary-share-revoke-confirm" />
              <Button label="Keep sharing" onPress={() => setConfirmRevoke(false)} />
            </>
          )}
        </>
      )}

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
        <View style={styles.sheet} testID="diary-share-sheet">
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <SectionTitle>Share this hunt</SectionTitle>
            <Text style={ui.muted}>Audience: My crew (default). Exact location, start time and your track are never included.</Text>
            {crews.length === 0 ? (
              <Notice tone="error">You need a crew before you can share. Create one under Crews.</Notice>
            ) : (
              <View style={styles.chips}>
                {crews.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setCrewId(c.id)}
                    style={[styles.chip, crewId === c.id && styles.chipOn]}
                    testID={`diary-share-crew-${c.id}`}
                  >
                    <Text style={styles.chipText}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={ui.muted}>Expires in</Text>
            <View style={styles.chips}>
              {DIARY_SHARE_TTL_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setTtlDays(d)}
                  style={[styles.chip, ttlDays === d && styles.chipOn]}
                  testID={`diary-share-ttl-${d}`}
                >
                  <Text style={styles.chipText}>{d === DIARY_SHARE_DEFAULT_TTL_DAYS ? `${d} days (default)` : `${d} days`}</Text>
                </Pressable>
              ))}
            </View>
            {flags.shareLinkViewCounts ? <Text style={ui.muted}>{DIARY_SHARE_VIEW_COUNT_DISCLOSE}</Text> : null}
            {hasPhotos ? <Notice tone="info">{DIARY_SHARE_PHOTO_WARNING}</Notice> : null}
            <Button
              label={busy ? 'Creating…' : 'Create link'}
              icon="share-outline"
              onPress={() => void onCreate()}
              disabled={busy}
              testID="diary-share-sheet-create"
            />
            <Button label="Cancel" onPress={() => setSheetOpen(false)} />
          </ScrollView>
        </View>
      </Modal>
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

            <DiarySharePanel clientId={e.clientId} synced={e.sync.status === 'synced'} hasPhotos={!!d?.photos.length} />

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
  share: { gap: space.sm, paddingVertical: space.sm },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.ground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: space.lg,
  },
  sheetBody: { padding: space.lg, gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.tile },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
});
