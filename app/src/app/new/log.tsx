import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { Button, Chip, Notice, SectionTitle, Stepper, ui } from '@/components/ui';
import { backend } from '@/data';
import { useJournal, usePlaces, useSession } from '@/data/hooks';
import { DiaryForm, diaryDraft } from '@/app/diary/new';
import { addJournalEntry, type JournalEntry } from '@/data/journal';
import { emptyDiaryDetails } from '@/data/types';
import { allSpecies, placeTypeLabel, speciesLabel, type LocationVisibility, type Place, type PlaceCount, type Species } from '@/data/types';
import { addDays, etParts, formatDay, formatTime, publicAfterET, todayET } from '@/lib/time';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

const groupFor: Record<Species, string> = {
  pheasant: 'pa-pheasant',
  dove: 'pa-dove',
  turkey: 'pa-turkey',
  grouse: 'pa-grouse',
  waterfowl: 'pa-waterfowl',
};

const speciesForPlace = (p: Place): Species | null =>
  p.type === 'stocking' ? 'pheasant' : p.type === 'dove_field' ? 'dove' : null;

const emptyCount = (place: Place | null): PlaceCount => ({
  placeId: place?.id ?? null,
  placeName: place?.name ?? 'Unlisted spot',
  flushed: 0,
  roosters: 0,
  harvested: 0,
});

export default function NewLogScreen() {
  return <LogForm />;
}

/**
 * The after-the-hunt form. Default ("Log hunt", /new/log) always saves privately
 * and never creates a post; /new/post renders it with mode="post" for delayed sharing.
 */
export function LogForm({ mode: fixedMode }: { mode?: 'diary' | 'post' }) {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const mode = fixedMode ?? 'diary';
  // "Log hunt" (the default, mode=diary) always saves privately and never creates a post.
  // Only the chooser's "Post" (mode=post) offers delayed sharing.
  const isPost = mode === 'post';
  const { places } = usePlaces();
  const session = useSession();

  const [species, setSpecies] = useState<Species | null>(null);
  const [huntedOn, setHuntedOn] = useState(todayET());
  const [counts, setCounts] = useState<PlaceCount[]>([]);
  const [caption, setCaption] = useState('');
  const [chosenAudience, setAudience] = useState<'shared' | 'private'>('shared');
  const audience = isPost ? chosenAudience : 'private';
  const [location, setLocation] = useState<LocationVisibility>('blurred');
  const [toGroup, setToGroup] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<'shared' | 'private' | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  // Arriving from a place on the map pre-fills that place.
  useEffect(() => {
    const place = places.find((p) => p.id === placeId);
    if (!place) return;
    setCounts((c) => (c.some((x) => x.placeId === place.id) ? c : [...c, emptyCount(place)]));
    setSpecies((s) => s ?? speciesForPlace(place));
    setDone(null);
  }, [placeId, places]);

  const firstPlace = places.find((p) => p.id === counts.find((c) => c.placeId)?.placeId);
  const exact = firstPlace?.center ?? null;
  const publicAt = publicAfterET(new Date());
  const today = todayET();
  const needsAccount = backend.mode === 'supabase' && !session;

  const addPlace = (place: Place | null) => {
    setCounts((c) => [...c, emptyCount(place)]);
    if (place) setSpecies((s) => s ?? speciesForPlace(place));
    setPicking(false);
  };
  const updateCount = (i: number, patch: Partial<PlaceCount>) =>
    setCounts((c) => c.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const reset = () => {
    setCounts([]);
    setCaption('');
    setSpecies(null);
    setToGroup(false);
    setHuntedOn(todayET());
    router.setParams({ placeId: undefined });
  };

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const draft = {
      species,
      caption: caption.trim(),
      huntedOn,
      counts,
      exact: location === 'blurred' ? exact : null,
      location: exact ? location : ('hidden' as const),
      audience,
      groupSlug: toGroup && species ? groupFor[species] : null,
    };
    try {
      if (audience === 'private') {
        await addJournalEntry(draft, { id: session?.userId ?? 'me', username: null, displayName: 'You' });
      } else {
        await backend.createPost(draft);
      }
      setDone(audience);
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const empty = !caption.trim() && counts.length === 0;

  // Log hunt: the rich private diary form (spec §3.2). Post keeps the delayed-share form below.
  if (!isPost) {
    const place = places.find((p) => p.id === placeId);
    return (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Log hunt" subtitle="Saves to your private Hunt Log. Not a post." />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {savedId && (
            <Notice tone="success">Saved to your private log on this device. It backs up to your account when you’re online.</Notice>
          )}
          {savedId && (
            <View style={styles.row}>
              <Button label="Open entry" onPress={() => router.push({ pathname: '/diary/[id]', params: { id: savedId } })} style={{ flex: 1 }} />
              <Button label="Log another" onPress={() => setSavedId(null)} style={{ flex: 1 }} />
            </View>
          )}
          {!savedId && (
            <DiaryForm
              key={`${formKey}-${place?.id ?? ""}`}
              initial={{
                huntedOn: todayET(),
                place: place?.name ?? '',
                notes: '',
                details: { ...emptyDiaryDetails(), species: place && speciesForPlace(place) ? [speciesForPlace(place)!] : [] },
              }}
              submitLabel="Save to diary"
              onSubmit={async (v) => {
                const { draft, details } = diaryDraft(v);
                if (place && draft.counts[0]?.placeName === place.name) draft.counts[0].placeId = place.id;
                const e = await addJournalEntry(draft, { id: session?.userId ?? 'me', username: null, displayName: 'You' }, details);
                setSavedId(e.id);
                setFormKey((k) => k + 1);
              }}
            />
          )}
          <PrivateLog />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        title={isPost ? 'Post' : 'Log hunt'}
        subtitle={isPost ? 'Share with hunters. Delayed, location blurred.' : 'Saves to your private Hunt Log. Not a post.'}
        back
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {done && (
          <Notice tone="success">
            {done === 'private'
              ? 'Saved to your private log on this device. It backs up when you’re online.'
              : `Posted. Others will see it from ${formatDay(etParts(publicAt).ymd)} at ${formatTime(publicAt)} ET.`}
          </Notice>
        )}
        {done && (
          <View style={styles.row}>
            <Button label={done === 'private' ? 'My log' : 'View in feed'} onPress={() => router.push(done === 'private' ? '/profile' : '/feed')} style={{ flex: 1 }} />
            <Button label="Log another" onPress={() => setDone(null)} style={{ flex: 1 }} />
          </View>
        )}

        <SectionTitle>Species</SectionTitle>
        <View style={ui.row}>
          {allSpecies.map((s) => (
            <Chip key={s} label={speciesLabel[s]} active={species === s} onPress={() => setSpecies(species === s ? null : s)} />
          ))}
        </View>

        <SectionTitle>Day</SectionTitle>
        <View style={ui.row}>
          <Chip label="Today" active={huntedOn === today} onPress={() => setHuntedOn(today)} />
          <Chip label="Yesterday" active={huntedOn === addDays(today, -1)} onPress={() => setHuntedOn(addDays(today, -1))} />
          <Chip label={formatDay(addDays(today, -2))} active={huntedOn === addDays(today, -2)} onPress={() => setHuntedOn(addDays(today, -2))} />
        </View>

        <SectionTitle>Birds by place</SectionTitle>
        <Text style={ui.muted}>Only you ever see which places. Others see the totals.</Text>
        {counts.map((row, i) => (
          <View key={`${row.placeId}-${i}`} style={ui.card} testID={`count-row-${i}`}>
            <View style={styles.row}>
              <Ionicons name="location-outline" size={18} color={colors.accent} />
              <Text style={[styles.placeName, { flex: 1 }]} numberOfLines={1}>
                {row.placeName}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${row.placeName}`}
                onPress={() => setCounts((c) => c.filter((_, j) => j !== i))}
                style={styles.remove}
              >
                <Ionicons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>
            <View style={styles.row}>
              <Stepper label="Flushed" value={row.flushed} onChange={(n) => updateCount(i, { flushed: n })} />
              <Stepper label="Roosters" value={row.roosters} onChange={(n) => updateCount(i, { roosters: n })} />
              <Stepper label="Harvested" value={row.harvested} onChange={(n) => updateCount(i, { harvested: n })} />
            </View>
          </View>
        ))}
        {picking ? (
          <PlacePicker places={places} onPick={addPlace} onCancel={() => setPicking(false)} />
        ) : (
          <Button label="Add a place" icon="add" onPress={() => setPicking(true)} />
        )}

        <SectionTitle>Notes</SectionTitle>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="How did it go? Dog work, cover, conditions…"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={2000}
          style={[ui.input, { minHeight: 96, textAlignVertical: 'top' }]}
          accessibilityLabel="Notes"
        />

        <View style={styles.photo} accessibilityLabel="Photo upload coming soon">
          <Ionicons name="camera-outline" size={24} color={colors.muted} />
          <Text style={ui.muted}>Photos are coming soon. They’ll be stripped of GPS before upload.</Text>
        </View>

        <SectionTitle>Who sees it</SectionTitle>
        {isPost && (
          <View style={ui.row}>
            <Chip label="Share (delayed)" icon="time-outline" active={audience === 'shared'} onPress={() => setAudience('shared')} />
            <Chip label="Private" icon="lock-closed-outline" active={audience === 'private'} onPress={() => setAudience('private')} />
          </View>
        )}
        {audience === 'private' ? (
          <Notice>Private: saved on this device first, then backed up to your account where only you can see it. Never shared.</Notice>
        ) : (
          <>
            <Notice>
              Delayed: only you see it until {formatDay(etParts(publicAt).ymd)} {formatTime(publicAt)} ET, then it’s public
              to signed-in hunters. PA law bars real-time game alerts, so nothing posts live.
            </Notice>
            {exact ? (
              <View style={ui.row}>
                <Chip label="Show ~5 km area" icon="eye-off-outline" active={location === 'blurred'} onPress={() => setLocation('blurred')} />
                <Chip label="Hide location" icon="close-circle-outline" active={location === 'hidden'} onPress={() => setLocation('hidden')} />
              </View>
            ) : (
              <Text style={ui.muted}>No place added, so no location is attached.</Text>
            )}
            {species && (
              <Chip
                label={`Also post to PA ${speciesLabel[species]}`}
                icon="people-outline"
                active={toGroup}
                onPress={() => setToGroup((v) => !v)}
              />
            )}
          </>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        {audience === 'shared' && needsAccount ? (
          <View style={ui.card}>
            <Text style={ui.body}>Sign in to share. Private entries work without an account.</Text>
            <Button label="Sign in" variant="primary" onPress={() => router.push('/sign-in')} />
          </View>
        ) : (
          <Button
            label={audience === 'private' ? 'Save privately' : 'Share tomorrow (12h+ delay)'}
            icon={audience === 'private' ? 'lock-closed' : 'send'}
            variant="primary"
            disabled={empty}
            busy={busy}
            onPress={submit}
          />
        )}

        <PrivateLog />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const syncLabel = (e: JournalEntry, signedOut: boolean) => {
  if (e.sync.status === 'synced') return { text: 'Backed up', icon: 'cloud-done-outline' as const, color: colors.success };
  if (e.sync.conflict) return { text: 'Conflict: changed elsewhere', icon: 'git-compare-outline' as const, color: colors.danger };
  if (e.sync.status === 'failed') return { text: 'Not backed up yet · will retry', icon: 'cloud-offline-outline' as const, color: colors.danger };
  return { text: signedOut ? 'On this device · sign in to back up' : 'Waiting to back up', icon: 'cloud-upload-outline' as const, color: colors.muted };
};

function PrivateLog() {
  const { data, retry } = useJournal();
  const session = useSession();
  const signedOut = backend.mode === 'supabase' && !session;
  if (!data?.length) return null;
  const stuck = data.some((e) => e.sync.status === 'failed' && !e.sync.conflict);
  return (
    <View style={{ gap: space.sm }} testID="private-log">
      <SectionTitle>Your private log</SectionTitle>
      {data.slice(0, 20).map((e) => {
        const s = syncLabel(e, signedOut);
        return (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            accessibilityHint="Opens the diary entry"
            onPress={() => router.push({ pathname: '/diary/[id]', params: { id: e.id } })}
            style={ui.card}
            testID={`journal-${e.clientId}`}
          >
            <Text style={styles.placeName} numberOfLines={1}>
              {e.caption || (e.species ? speciesLabel[e.species] : 'Hunt')} {e.huntedOn ? ` · ${formatDay(e.huntedOn)}` : ''}
            </Text>
            <View style={styles.row} accessibilityLabel={`Sync status: ${s.text}`}>
              <Ionicons name={s.icon} size={16} color={s.color} />
              <Text style={[ui.muted, { color: s.color }]}>{s.text}</Text>
            </View>
          </Pressable>
        );
      })}
      {stuck && <Button label="Retry backup now" icon="refresh" onPress={() => void retry()} />}
    </View>
  );
}

function PlacePicker({
  places,
  onPick,
  onCancel,
}: {
  places: Place[];
  onPick: (p: Place | null) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? places.filter((p) => p.name.toLowerCase().includes(s) || (p.county ?? '').toLowerCase().includes(s)) : places).slice(0, 6);
  }, [places, q]);
  return (
    <View style={ui.card}>
      <TextInput
        value={q}
        onChangeText={setQ}
        autoFocus
        placeholder="Search game lands, fields, counties"
        placeholderTextColor={colors.muted}
        style={ui.input}
        accessibilityLabel="Search places to add"
      />
      {hits.map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => onPick(p)} style={styles.pick}>
          <Text style={styles.placeName}>{p.name}</Text>
          <Text style={ui.muted}>
            {placeTypeLabel[p.type]}
            {p.county ? ` · ${p.county} County` : ''}
          </Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={() => onPick(null)} style={styles.pick}>
        <Text style={styles.placeName}>Unlisted spot</Text>
        <Text style={ui.muted}>Private land or somewhere not on the map. No location attached.</Text>
      </Pressable>
      <Button label="Cancel" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  placeName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  remove: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginRight: -space.sm },
  pick: { minHeight: touchTarget, justifyContent: 'center', paddingVertical: space.xs },
  photo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginTop: space.sm,
  },
});
