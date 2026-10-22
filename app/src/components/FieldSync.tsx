import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { backend } from '@/data';
import { useSession } from '@/data/hooks';
import { onJournalChange, syncJournal } from '@/data/journal';
import { getSignal, onSignal, startConnectivity } from '@/lib/connectivity';
import { chipText, copy, onFieldChange, onToast, pendingHunts, readFlags, setFlags, showToast, signalBackText, TOAST_MS, welcomeBackOnce } from '@/lib/fieldDraft';
import { colors, fonts, radius, space } from '@/theme/tokens';

export const TAN = '#E8C872';

export function useSignal() {
  startConnectivity();
  return useSyncExternalStore(onSignal, getSignal, getSignal);
}

/** Pending (not yet uploaded) hunts plus the Retry flag, live. */
export function usePending() {
  const [state, setState] = useState<{ count: number; failed: boolean; loaded: boolean }>({ count: 0, failed: false, loaded: false });
  const load = useCallback(async () => {
    const [list, flags] = await Promise.all([pendingHunts(), readFlags()]);
    setState({ count: list.length, failed: !!flags.signInFailed, loaded: true });
  }, []);
  useEffect(() => {
    void load();
    const a = onJournalChange(() => void load());
    const b = onFieldChange(() => void load());
    return () => {
      a();
      b();
    };
  }, [load]);
  return state;
}

/**
 * Spec 04/05/06/07: a persistent 56pt chip above the action bar while hunts wait
 * for sign-in. Never a modal; signal returning only recolours it.
 */
export function PendingChip({ bottom }: { bottom: number }) {
  const session = useSession();
  const signal = useSignal();
  const { count, failed, loaded } = usePending();
  useEffect(() => {
    // Spec 08: the queue survived a kill or reboot.
    if (loaded && count && session === null && backend.mode === 'supabase') void welcomeBackOnce();
  }, [loaded, count, session]);
  if (session !== null || backend.mode !== 'supabase' || !count) return null;
  const back = signal.online && signal.back;
  const open = () =>
    signal.online ? router.push({ pathname: '/new/log', params: { signin: '1' } }) : router.push('/pending');
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={back ? signalBackText(count) : chipText(count)}
        onPress={open}
        style={[styles.chip, back && styles.chipBack]}
        testID="pending-chip"
      >
        {!back && <View style={styles.dot} testID="pending-chip-dot" />}
        <Text style={[styles.text, back && styles.textBack]} numberOfLines={1}>
          {back ? `${signalBackText(count)} ›` : chipText(count)}
        </Text>
        {!signal.online ? (
          <Text style={styles.side}>{copy.noSignal}</Text>
        ) : failed && !back ? (
          <Text style={[styles.side, { color: colors.text }]}>{copy.retry}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * Non-blocking toasts (auto-dismiss after 4 s) and the "sync everything once a
 * session exists" hook. Mounted once at the root.
 */
export function FieldToasts() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () =>
      onToast((t) => {
        setText(t);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setText(null), TOAST_MS);
      }),
    [],
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  // Signed in with hunts waiting: upload them all (one sign-in syncs every pending hunt), then confirm.
  const userId = session?.userId;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    (async () => {
      const before = (await pendingHunts()).length;
      if (!before) return;
      await setFlags({ signInFailed: false, confirmPending: false });
      const r = await syncJournal(backend, { force: true }).catch(() => null);
      if (live && r && r.synced > 0 && (await pendingHunts()).length < before) showToast(copy.savedToAccount);
    })();
    return () => {
      live = false;
    };
  }, [userId]);
  if (!text) return null;
  return (
    <View style={[styles.toastWrap, { bottom: insets.bottom + 96 }]} pointerEvents="none">
      <View style={styles.toast} accessibilityLiveRegion="polite" testID="field-toast">
        <Text style={styles.toastText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md },
  chip: {
    minHeight: 56,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: TAN,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  chipBack: { backgroundColor: colors.accent, borderColor: colors.accent },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: TAN },
  text: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, color: '#F2F4EF' },
  textBack: { color: colors.ground },
  side: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.muted },
  toastWrap: { position: 'absolute', left: space.md, right: space.md, alignItems: 'center' },
  toast: { backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  toastText: { fontFamily: fonts.bodySemi, fontSize: 16, color: '#F2F4EF' },
});
