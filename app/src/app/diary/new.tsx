import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { Button, Chip, Notice, SectionTitle, Stepper, ui } from '@/components/ui';
import { listDogs, saveDog } from '@/data/dogs';
import { useSession } from '@/data/hooks';
import { addJournalEntry, type JournalEntry } from '@/data/journal';
import {
  allCoverTypes,
  allSpecies,
  coverLabel,
  emptyDiaryDetails,
  speciesLabel,
  type DiaryBirds,
  type DiaryDetails,
  type DiaryDog,
  type Dog,
  type PlaceCount,
  type PostDraft,
  type Species,
} from '@/data/types';
import { addDays, formatDay, todayET } from '@/lib/time';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

export interface DiaryFormValue {
  huntedOn: string;
  place: string;
  notes: string;
  details: DiaryDetails;
}

const num = (s: string): number | null => {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
export const birdsTotal = (birds: DiaryBirds[]) => birds.reduce((t, b) => t + b.count, 0);

/** Turn the form into the queue's draft + details. */
export function diaryDraft(v: DiaryFormValue): { draft: PostDraft; details: DiaryDetails } {
  const roosters = v.details.birds.reduce((t, b) => t + (b.roosters ?? 0), 0);
  const counts: PlaceCount[] = v.place.trim()
    ? [{ placeId: null, placeName: v.place.trim(), flushed: v.details.flushes, roosters, harvested: birdsTotal(v.details.birds) }]
    : [];
  return {
    draft: {
      species: v.details.species[0] ?? null,
      caption: v.notes.trim(),
      huntedOn: v.huntedOn,
      counts,
      exact: null,
      location: 'hidden',
      audience: 'private',
      groupSlug: null,
    },
    details: { ...v.details, birds: v.details.birds.filter((b) => v.details.species.includes(b.species)) },
  };
}

export function formValueFrom(e: JournalEntry): DiaryFormValue {
  return {
    huntedOn: e.huntedOn ?? todayET(),
    place: e.placeCounts?.[0]?.placeName ?? '',
    notes: e.caption,
    details: e.details ?? { ...emptyDiaryDetails(), species: e.species ? [e.species] : [] },
  };
}

/** The rich diary form (spec §3.2), shared by new and edit. */
export function DiaryForm({
  initial,
  submitLabel,
  onSubmit,
  variant = 'full',
  footerNote,
}: {
  initial: DiaryFormValue;
  submitLabel: string;
  onSubmit: (v: DiaryFormValue) => Promise<void>;
  /** 'sheet' = redesign Log hunt sheet: essentials above the fold, the rest behind one row, sticky Save. */
  variant?: 'full' | 'sheet';
  footerNote?: string;
}) {
  const sheet = variant === 'sheet';
  const [showDetails, setShowDetails] = useState(!sheet);
  const [moreSpecies, setMoreSpecies] = useState(false);
  const [v, setV] = useState(initial);
  const [roster, setRoster] = useState<Dog[]>([]);
  const [newDog, setNewDog] = useState('');
  const [hours, setHours] = useState(initial.details.hours?.toString() ?? '');
  const [miles, setMiles] = useState(initial.details.miles?.toString() ?? '');
  const [temp, setTemp] = useState(initial.details.weather?.tempF?.toString() ?? '');
  const [wind, setWind] = useState(initial.details.weather?.windMph?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const today = todayET();

  useEffect(() => {
    listDogs().then(setRoster);
  }, []);

  const d = v.details;
  const setD = (patch: Partial<DiaryDetails>) => setV((s) => ({ ...s, details: { ...s.details, ...patch } }));
  const setWeather = (patch: Partial<NonNullable<DiaryDetails['weather']>>) =>
    setD({ weather: { tempF: null, windMph: null, windDir: null, sky: null, precip: null, ...d.weather, ...patch } });

  const toggleSpecies = (s: Species) => {
    const species = toggle(d.species, s);
    const birds = species.map((sp) => d.birds.find((b) => b.species === sp) ?? { species: sp, count: 0, ...(sp === 'pheasant' ? { roosters: 0, hens: 0 } : {}) });
    setD({ species, birds });
  };
  const setBirds = (s: Species, patch: Partial<DiaryBirds>) =>
    setD({
      birds: d.birds.map((b) => {
        if (b.species !== s) return b;
        const next = { ...b, ...patch };
        return s === 'pheasant' ? { ...next, count: (next.roosters ?? 0) + (next.hens ?? 0) } : next;
      }),
    });
  const toggleDog = (dog: Dog) =>
    setD({
      dogs: d.dogs.some((x) => x.dogId === dog.id)
        ? d.dogs.filter((x) => x.dogId !== dog.id)
        : [...d.dogs, { dogId: dog.id, name: dog.name, points: 0, flushes: 0, retrieves: 0 }],
    });
  const setDog = (id: string, patch: Partial<DiaryDog>) => setD({ dogs: d.dogs.map((x) => (x.dogId === id ? { ...x, ...patch } : x)) });
  const addDog = async () => {
    if (!newDog.trim()) return;
    const dog = await saveDog({ name: newDog });
    setRoster((r) => [...r, dog]);
    setNewDog('');
    setD({ dogs: [...d.dogs, { dogId: dog.id, name: dog.name, points: 0, flushes: 0, retrieves: 0 }] });
  };

  const submit = async () => {
    const h = num(hours);
    const m = num(miles);
    if ((hours.trim() && h === null) || (h !== null && h > 24)) return setError('Hours should be a number from 0 to 24.');
    if ((miles.trim() && m === null) || (m !== null && m > 100)) return setError('Miles should be a number from 0 to 100.');
    if (d.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.startTime)) return setError('Start time should look like 07:30.');
    setError(undefined);
    setBusy(true);
    try {
      const weather = d.weather ? { ...d.weather, tempF: temp.trim() ? Number(temp) : null, windMph: num(wind) } : temp || wind ? { tempF: temp.trim() ? Number(temp) : null, windMph: num(wind), windDir: null, sky: null, precip: null } : null;
      await onSubmit({ ...v, details: { ...d, hours: h, miles: m, startTime: d.startTime || null, weather } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const topSpecies = (() => {
    const order = [...d.species, ...allSpecies.filter((s) => !d.species.includes(s))];
    return sheet && !moreSpecies ? order.slice(0, Math.max(3, d.species.length)) : allSpecies;
  })();
  const primary = d.birds[0];
  const harvested = birdsTotal(d.birds);
  const setHarvested = (n: number) => {
    if (!primary) return;
    if (primary.species === 'pheasant') setBirds('pheasant', { roosters: Math.max(0, n - (primary.hens ?? 0)) });
    else setBirds(primary.species, { count: Math.max(0, n - (harvested - primary.count)) });
  };

  const essentials = sheet ? (
    <>
      <View style={ui.card} testID="where-when">
        <SectionTitle>Where & when</SectionTitle>
      <TextInput value={v.place} onChangeText={(place) => setV({ ...v, place })} placeholder="SGL, stocking site or private spot" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="Place" />

      <View style={ui.row}>
        <Chip label="Today" active={v.huntedOn === today} onPress={() => setV({ ...v, huntedOn: today })} />
        <Chip label="Yesterday" active={v.huntedOn === addDays(today, -1)} onPress={() => setV({ ...v, huntedOn: addDays(today, -1) })} />
        <Chip label={formatDay(addDays(today, -2))} active={v.huntedOn === addDays(today, -2)} onPress={() => setV({ ...v, huntedOn: addDays(today, -2) })} />
      </View>

      </View>
      <SectionTitle>Species</SectionTitle>
      <View style={ui.row}>
        {topSpecies.map((s) => (
          <Chip key={s} label={speciesLabel[s]} active={d.species.includes(s)} onPress={() => toggleSpecies(s)} />
        ))}
        {!moreSpecies && topSpecies.length < allSpecies.length && <Chip label="More…" onPress={() => setMoreSpecies(true)} />}
      </View>
      <SectionTitle>Birds</SectionTitle>
      <View style={styles.row}>
        <Stepper label="Flushes" value={d.flushes} onChange={(n) => setD({ flushes: n })} />
        {primary ? (
          <Stepper label="Harvested" value={harvested} onChange={setHarvested} />
        ) : (
          <Text style={ui.muted}>Pick a species to count harvested birds.</Text>
        )}
      </View>
      {!showDetails && (
        <Pressable accessibilityRole="button" accessibilityLabel="Add dog, weather, cover, notes, photo" onPress={() => setShowDetails(true)} style={styles.more}>
          <Text style={styles.label}>＋ Dog, weather, cover, notes, photo</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      )}
    </>
  ) : (
    <>
      <SectionTitle>When</SectionTitle>
      <View style={ui.row}>
        <Chip label="Today" active={v.huntedOn === today} onPress={() => setV({ ...v, huntedOn: today })} />
        <Chip label="Yesterday" active={v.huntedOn === addDays(today, -1)} onPress={() => setV({ ...v, huntedOn: addDays(today, -1) })} />
        <Chip label={formatDay(addDays(today, -2))} active={v.huntedOn === addDays(today, -2)} onPress={() => setV({ ...v, huntedOn: addDays(today, -2) })} />
      </View>
      <TextInput value={d.startTime ?? ''} onChangeText={(t) => setD({ startTime: t })} placeholder="Start time, e.g. 07:30" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="Start time" />

      <SectionTitle>Where</SectionTitle>
      <TextInput value={v.place} onChangeText={(place) => setV({ ...v, place })} placeholder="SGL, stocking site or private spot" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="Place" />

      <SectionTitle>Species</SectionTitle>
      <View style={ui.row}>
        {allSpecies.map((s) => (
          <Chip key={s} label={speciesLabel[s]} active={d.species.includes(s)} onPress={() => toggleSpecies(s)} />
        ))}
      </View>

    </>
  );

  const details = showDetails && (
    <>
      {sheet && (
        <>
          <SectionTitle>Start time</SectionTitle>
  <TextInput value={d.startTime ?? ''} onChangeText={(t) => setD({ startTime: t })} placeholder="Start time, e.g. 07:30" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="Start time" />
        </>
      )}
      <SectionTitle>Dogs</SectionTitle>
      <View style={ui.row}>
        {roster.map((dog) => (
          <Chip key={dog.id} label={dog.name} icon="paw-outline" active={d.dogs.some((x) => x.dogId === dog.id)} onPress={() => toggleDog(dog)} />
        ))}
      </View>
      <View style={styles.row}>
        <TextInput value={newDog} onChangeText={setNewDog} placeholder="Add a dog" placeholderTextColor={colors.muted} style={[ui.input, { flex: 1 }]} accessibilityLabel="New dog name" />
        <Button label="Add dog" icon="add" onPress={() => void addDog()} />
      </View>
      {d.dogs.map((dog) => (
        <View key={dog.dogId} style={ui.card} testID={`dog-${dog.name}`}>
          <Text style={styles.label}>{dog.name}</Text>
          <View style={styles.row}>
            <Stepper label={`${dog.name} points`} value={dog.points} onChange={(n) => setDog(dog.dogId, { points: n })} />
            <Stepper label={`${dog.name} flushes`} value={dog.flushes} onChange={(n) => setDog(dog.dogId, { flushes: n })} />
            <Stepper label={`${dog.name} retrieves`} value={dog.retrieves} onChange={(n) => setDog(dog.dogId, { retrieves: n })} />
          </View>
        </View>
      ))}

      <SectionTitle>Cover</SectionTitle>
      <View style={ui.row}>
        {allCoverTypes.map((c) => (
          <Chip key={c} label={coverLabel[c]} active={d.cover.includes(c)} onPress={() => setD({ cover: toggle(d.cover, c) })} />
        ))}
      </View>

      <SectionTitle>Effort</SectionTitle>
      <View style={styles.row}>
        <TextInput value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholder="Hours" placeholderTextColor={colors.muted} style={[ui.input, { flex: 1 }]} accessibilityLabel="Hours hunted" />
        <TextInput value={miles} onChangeText={setMiles} keyboardType="decimal-pad" placeholder="Miles" placeholderTextColor={colors.muted} style={[ui.input, { flex: 1 }]} accessibilityLabel="Miles walked" />
      </View>
      <View style={styles.row}>
        {!sheet && <Stepper label="Flushes" value={d.flushes} onChange={(n) => setD({ flushes: n })} />}
        <Stepper label="Shots" value={d.shots} onChange={(n) => setD({ shots: n })} />
      </View>

      {d.species.length > 0 && <SectionTitle>Birds</SectionTitle>}
      {d.birds.map((b) => (
        <View key={b.species} style={ui.card}>
          <Text style={styles.label}>{speciesLabel[b.species]}</Text>
          {b.species === 'pheasant' ? (
            <View style={styles.row}>
              <Stepper label="Roosters bagged" value={b.roosters ?? 0} onChange={(n) => setBirds('pheasant', { roosters: n })} />
              <Stepper label="Hens bagged" value={b.hens ?? 0} onChange={(n) => setBirds('pheasant', { hens: n })} />
            </View>
          ) : (
            <Stepper label={`${speciesLabel[b.species]} bagged`} value={b.count} onChange={(n) => setBirds(b.species, { count: n })} />
          )}
        </View>
      ))}

      <SectionTitle>Weather</SectionTitle>
      <Text style={ui.muted}>Enter it by hand for now.</Text>
      <View style={styles.row}>
        <TextInput value={temp} onChangeText={setTemp} keyboardType="numbers-and-punctuation" placeholder="Temp °F" placeholderTextColor={colors.muted} style={[ui.input, { flex: 1 }]} accessibilityLabel="Temperature" />
        <TextInput value={wind} onChangeText={setWind} keyboardType="decimal-pad" placeholder="Wind mph" placeholderTextColor={colors.muted} style={[ui.input, { flex: 1 }]} accessibilityLabel="Wind speed" />
        <TextInput value={d.weather?.windDir ?? ''} onChangeText={(t) => setWeather({ windDir: t || null })} placeholder="Dir" placeholderTextColor={colors.muted} style={[ui.input, { flex: 1 }]} accessibilityLabel="Wind direction" />
      </View>
      <TextInput value={d.weather?.sky ?? ''} onChangeText={(t) => setWeather({ sky: t || null })} placeholder="Sky and precipitation" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="Sky" />

      <SectionTitle>Notes</SectionTitle>
      <TextInput value={v.notes} onChangeText={(notes) => setV({ ...v, notes })} multiline maxLength={2000} placeholder="Dog work, cover, conditions…" placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 96, textAlignVertical: 'top' }]} accessibilityLabel="Notes" />

      <SectionTitle>Photos</SectionTitle>
      <Text style={ui.muted}>
        {d.photos.length ? `${d.photos.length} private photo${d.photos.length > 1 ? 's' : ''}. ` : ''}Photos stay private to you and back up to your account only.
      </Text>

    </>
  );

  const footer = (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      <Button label={submitLabel} icon={sheet ? undefined : 'lock-closed'} variant="primary" busy={busy} onPress={submit} />
      {footerNote ? <Text style={[ui.muted, { textAlign: 'center' }]}>{footerNote}</Text> : null}
    </>
  );

  if (sheet) {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          {essentials}
          {details}
        </ScrollView>
        <View style={styles.sticky} testID="sticky-save">
          {footer}
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      {essentials}
      {details}
      {footer}
    </View>
  );
}

export default function NewDiaryEntry() {
  const session = useSession();
  const initial: DiaryFormValue = { huntedOn: todayET(), place: '', notes: '', details: emptyDiaryDetails() };
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader back title="New diary entry" subtitle="Private. Saved on this device first, then backed up for you only." />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <DiaryForm
          initial={initial}
          submitLabel="Save to diary"
          onSubmit={async (v) => {
            const { draft, details } = diaryDraft(v);
            const e = await addJournalEntry(draft, { id: session?.userId ?? 'me', username: null, displayName: 'You' }, details);
            router.replace({ pathname: '/diary/[id]', params: { id: e.id } });
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  label: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  sheetBody: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm },
  sticky: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg, gap: space.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.ground },
  more: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
});
