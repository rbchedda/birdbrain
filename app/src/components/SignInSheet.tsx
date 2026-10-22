import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { Notice } from '@/components/ui';
import { flags } from '@/lib/flags';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

// Copy from designer's redesign, mockup 02b (birdbrain-redesign/mockups/02b-log-signin-on-save).
export const signInSheetTitle = 'Keep your hunt diary';
export const signInSheetBody = 'Sign in once so your hunts are backed up and only you can see them. Nothing is posted.';
export const notNowLabel = 'Not now — keep on this phone only';

function SheetButton({ label, icon, filled, onPress }: { label: string; icon?: keyof typeof Ionicons.glyphMap; filled?: boolean; onPress: () => void }) {
  const fg = filled ? colors.ground : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, filled ? styles.filled : styles.outline, pressed && { opacity: 0.85 }]}
    >
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * First-save sign-in sheet (redesign 02b). Apple is the filled primary once its
 * flag is on (blocked on Apple keys); until then email takes the primary slot.
 * "Not now" dismisses without anything going to the server.
 */
export function SignInSheet({
  onDismiss,
  held,
  appleEnabled = flags.appleSignIn,
  title = signInSheetTitle,
  body = signInSheetBody,
  dismissible = true,
  status,
  summary,
  onClose,
}: {
  /** Spec 01: one-line hunt summary shown under the title. */
  summary?: string | null;
  /** Swipe-down or grab-handle close; the hunt stays pending (spec 06). */
  onClose?: () => void;
  /** false on the Log hunt first save: no "Not now"; the hunt is already on the phone. */
  dismissible?: boolean;
  /** e.g. no-signal or confirm-your-email notice for the held entry. */
  status?: { tone: 'info' | 'error' | 'success'; text: string } | null;
  /** Per-action copy; defaults to the hunt-diary copy from 02b. */
  title?: string;
  body?: string;
  onDismiss?: () => void;
  /** e.g. "SGL 211 · Pheasant": an entry is waiting on the phone for sign-in. */
  held?: string | null;
  appleEnabled?: boolean;
}) {
  const [message, setMessage] = useState<string>();

  const email = async () => {
    router.push('/sign-in');
  };
  const apple = async () => {
    // TODO(apple-sign-in): expo-apple-authentication + supabase signInWithIdToken once keys exist.
    setMessage('Sign in with Apple isn’t available yet. Use email for now.');
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => !!onClose && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 60) onClose?.();
        },
      }),
    [onClose],
  );

  return (
    <View style={styles.sheet} testID="sign-in-sheet" accessibilityViewIsModal {...pan.panHandlers}>
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} hitSlop={12} style={styles.grabHit}>
          <View style={styles.grab} />
        </Pressable>
      ) : (
        <View style={styles.grab} />
      )}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {summary && <Text style={styles.summary} testID="sheet-summary">{summary}</Text>}
      <Text style={styles.body}>{body}</Text>
      {appleEnabled && <SheetButton label="Continue with Apple" icon="logo-apple" filled onPress={apple} />}
      <SheetButton label="Continue with email" icon="mail-outline" filled={!appleEnabled} onPress={email} />
      {message && <Notice tone="error">{message}</Notice>}
      {held && (
        <View style={styles.held}>
          <Ionicons name="lock-closed" size={14} color={colors.dove} />
          <Text style={styles.heldText}>
            Your entry for <Text style={styles.heldStrong}>{held}</Text> is held on this phone and saves the moment you sign in.
          </Text>
        </View>
      )}
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
      {dismissible && (
        <Pressable accessibilityRole="link" accessibilityLabel={notNowLabel} onPress={onDismiss} style={styles.notNow}>
          <Text style={styles.notNowText}>{notNowLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  grabHit: { alignSelf: 'center', paddingVertical: space.xs, paddingHorizontal: space.lg },
  summary: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.border },
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted },
  btn: { minHeight: 52, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  filled: { backgroundColor: colors.text },
  outline: { borderWidth: 1, borderColor: colors.border },
  btnText: { fontFamily: fonts.bodySemi, fontSize: 16 },
  held: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  heldText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  heldStrong: { fontFamily: fonts.bodySemi, color: colors.text },
  notNow: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  notNowText: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
});
