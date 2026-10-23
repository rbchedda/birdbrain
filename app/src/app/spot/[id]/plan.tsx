import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { SignInSheet } from '@/components/SignInSheet';
import { DateGrid } from '@/components/spot/DateGrid';
import { PlanDayCard, useSpot } from '@/components/spot/PlanParts';
import { Button, Chip, Notice } from '@/components/ui';
import { useMyCrews } from '@/data/crew';
import { useSession } from '@/data/hooks';
import { speciesLabel, type Species } from '@/data/types';
import { getPlan, savePlan, updatePlan, type Plan, type PlanDraft } from '@/lib/plans';
import {
  dayChipLabel,
  formatDay,
  LICENSE_YEAR_END,
  nextDays,
  nextOpenDate,
  PLAN_NOTES_MAX,
  reminderLabel,
  speciesChoices,
  todayET,
  type Reminder,
} from '@/lib/spotPlan';
import type { Ymd } from '@/lib/time';
import { colors, fonts, radius, space } from '@/theme/tokens';

export const planSignInTitle = 'Save your hunt plan';
export const planSignInBody = 'Sign in once so your plans are backed up and only you (and a crew you share with) can see them. Nothing is posted.';
const REMINDERS: Reminder[] = ['none', 'night_before_8pm', 'hour_before_legal'];

/** Spot detail spec 04–06: Plan a hunt, two steps. `?plan=<id>` edits an existing plan. */
export default function PlanAHunt() {
  const { id, plan: planId } = useLocalSearchParams<{ id: string; plan?: string }>();
  const spot = useSpot(id);
  const session = useSession();
  const { crews } = useMyCrews();
  const today = todayET();

  const [editing, setEditing] = useState<Plan | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [date, setDate] = useState<Ymd>(today);
  const [picker, setPicker] = useState(false);
  const [picked, setPicked] = useState<Species[]>([]);
  const [notes, setNotes] = useState('');
  const [reminder, setReminder] = useState<Reminder>('none');
  const [share, setShare] = useState(false);
  const [crewId, setCrewId] = useState<string | null>(null);
  const [askSignIn, setAskSignIn] = useState(false);
  const [saved, setSaved] = useState<Plan | null>(null);
  const held = useRef(false);

  useEffect(() => {
    if (!planId) return;
    getPlan(planId).then((p) => {
      if (!p) return;
      setEditing(p);
      setDate(p.date);
      setPicked(p.species);
      setNotes(p.notes);
      setReminder(p.reminder);
      setShare(!!p.crew);
      setCrewId(p.crew?.id ?? null);
    });
  }, [planId]);

  const place = spot ?? editing?.place ?? null;
  const choices = place ? speciesChoices(place, date) : [];
  const openNow = choices.filter((c) => c.open).map((c) => c.species);
  const chosen = picked.filter((s) => openNow.includes(s));
  const nothingOpen = !!place && choices.length > 0 && openNow.length === 0;
  const suggestion = nothingOpen && place ? nextOpenDate(place, date) : null;
  const crewList = crews ?? [];
  const crew = share ? (crewList.find((c) => c.id === crewId) ?? crewList[0] ?? null) : null;

  const draft = (): PlanDraft | null =>
    place ? { place, date, species: chosen, notes: notes.slice(0, PLAN_NOTES_MAX), reminder, crew: crew ? { id: crew.id, name: crew.name } : null } : null;

  const doSave = async (owner: string) => {
    const d = draft();
    if (!d) return;
    const p = editing ? await updatePlan(editing.id, d) : await savePlan(owner, d);
    setSaved(p);
  };

  const onSave = () => {
    if (!session) {
      held.current = true;
      setAskSignIn(true);
      return;
    }
    void doSave(session.userId);
  };

  // Signed in from the sheet: finish the held save.
  useEffect(() => {
    if (session && held.current) {
      held.current = false;
      setAskSignIn(false);
      void doSave(session.userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!place) {
    return (
      <View style={styles.root}>
        <ScreenHeader back title="Plan a hunt" />
        <Text style={[styles.muted, { padding: space.lg }]}>Spot not found.</Text>
      </View>
    );
  }

  const days = nextDays(today);
  return (
    <View style={styles.root}>
      <ScreenHeader back title={editing ? 'Edit plan' : 'Plan a hunt'} subtitle={`${place.name} · Step ${step} of 2`} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <Text style={styles.section}>Day</Text>
            <View style={styles.chips} testID="day-chips">
              {days.map((d) => (
                <Chip key={d} label={dayChipLabel(d, today)} active={d === date} onPress={() => setDate(d)} />
              ))}
              <Chip label={days.includes(date) ? 'Pick a date' : formatDay(date)} icon="calendar-outline" active={!days.includes(date)} onPress={() => setPicker(!picker)} />
            </View>
            {picker && (
              <DateGrid
                value={date}
                min={today}
                max={LICENSE_YEAR_END}
                onChange={(d) => {
                  setDate(d);
                  setPicker(false);
                }}
              />
            )}
            <PlanDayCard place={place} date={date} />
            <Text style={styles.section}>Species</Text>
            {nothingOpen ? (
              <View style={styles.none} testID="nothing-open">
                <Text style={styles.text}>Nothing open here on {formatDay(date)}.</Text>
                {suggestion && (
                  <Pressable accessibilityRole="button" onPress={() => setDate(suggestion)} testID="next-open">
                    <Text style={styles.link}>Next open: {formatDay(suggestion)} ›</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
            <View style={styles.chips} testID="species-chips">
              {choices.map((c) => (
                <Pressable
                  key={c.species}
                  accessibilityRole="button"
                  accessibilityLabel={c.open ? speciesLabel[c.species] : `${speciesLabel[c.species]}, ${c.hint}`}
                  accessibilityState={{ selected: chosen.includes(c.species), disabled: !c.open }}
                  disabled={!c.open}
                  onPress={() => setPicked((p) => (p.includes(c.species) ? p.filter((x) => x !== c.species) : [...p, c.species]))}
                  style={[styles.sp, chosen.includes(c.species) && styles.spOn, !c.open && { opacity: 0.5 }]}
                  testID={`species-${c.species}`}
                >
                  <Text style={[styles.spText, chosen.includes(c.species) && { color: colors.onAccent }]}>{speciesLabel[c.species]}</Text>
                  {!c.open && <Text style={styles.hint}>{c.hint}</Text>}
                </Pressable>
              ))}
            </View>
            <Button label="Next" variant="primary" disabled={nothingOpen} onPress={() => setStep(2)} />
          </>
        ) : (
          <>
            <Text style={styles.section}>Notes (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={(t) => setNotes(t.slice(0, PLAN_NOTES_MAX))}
              maxLength={PLAN_NOTES_MAX}
              multiline
              placeholder="Who’s coming, dogs, where to park…"
              placeholderTextColor={colors.muted}
              style={styles.input}
              accessibilityLabel="Notes"
              testID="plan-notes"
            />
            <Text style={styles.muted}>
              {notes.length}/{PLAN_NOTES_MAX}
            </Text>
            <Text style={styles.section}>Reminder</Text>
            <View style={styles.chips} testID="reminder-choices">
              {REMINDERS.map((r) => (
                <Chip key={r} label={reminderLabel[r]} active={reminder === r} onPress={() => setReminder(r)} />
              ))}
            </View>
            {reminder !== 'none' && <Text style={styles.muted}>Phone reminders aren’t switched on in this build yet; the plan keeps your choice.</Text>}
            {crewList.length > 0 && (
              <View style={{ gap: space.sm }} testID="share-crew">
                <View style={styles.switchRow}>
                  <Text style={styles.text}>Share with crew</Text>
                  <Switch value={share} onValueChange={setShare} accessibilityLabel="Share with crew" />
                </View>
                {share && crewList.length > 1 && (
                  <View style={styles.chips}>
                    {crewList.map((c) => (
                      <Chip key={c.id} label={c.name} active={crew?.id === c.id} onPress={() => setCrewId(c.id)} />
                    ))}
                  </View>
                )}
                {share && <Text style={styles.muted}>Your crew can see this plan. They can’t change it.</Text>}
              </View>
            )}
            {saved ? (
              <View style={styles.toast} testID="plan-saved-toast">
                <Text style={styles.toastText}>{saved.sync === 'synced' ? 'Plan saved' : 'Plan saved · on this phone until it syncs'}</Text>
                <Pressable accessibilityRole="link" onPress={() => router.replace({ pathname: '/plans/[id]', params: { id: saved.id } })} testID="toast-view">
                  <Text style={styles.toastLink}>View ›</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: space.sm }}>
                <Button label={editing ? 'Save changes' : 'Save plan'} variant="primary" onPress={onSave} />
                <Button label="Back" onPress={() => setStep(1)} />
              </View>
            )}
          </>
        )}
        {askSignIn && !session && (
          <Notice tone="info">Your plan isn’t saved yet. Sign in to save it.</Notice>
        )}
      </ScrollView>
      {askSignIn && !session && (
        <SignInSheet
          title={planSignInTitle}
          body={planSignInBody}
          onDismiss={() => {
            held.current = false;
            setAskSignIn(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  section: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  text: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  link: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.accent },
  none: { gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md },
  sp: { minHeight: 44, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  spOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  spText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  input: { minHeight: 96, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, color: colors.text, fontFamily: fonts.body, fontSize: 15, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  toast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.md, padding: space.md, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  toastText: { fontFamily: fonts.bodySemi, color: colors.text },
  toastLink: { fontFamily: fonts.bodySemi, color: colors.accent },
});
