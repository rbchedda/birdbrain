import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import { reportReasons, type ReportReason, type ReportTarget } from '@/data/types';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

export interface MenuAction {
  label: string;
  icon: IconName;
  onPress: () => void;
  danger?: boolean;
}

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>{children}</View>
    </Modal>
  );
}

/** Cross-platform action sheet (Alert buttons don't work on web). */
export function ActionMenu({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: MenuAction[];
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      {title && <Text style={styles.title}>{title}</Text>}
      {actions.map((a) => (
        <Pressable
          key={a.label}
          accessibilityRole="button"
          onPress={() => {
            onClose();
            a.onPress();
          }}
          style={styles.item}
        >
          <Ionicons name={a.icon} size={20} color={a.danger ? colors.danger : colors.text} />
          <Text style={[styles.itemText, a.danger && { color: colors.danger }]}>{a.label}</Text>
        </Pressable>
      ))}
      <Button label="Cancel" onPress={onClose} />
    </Sheet>
  );
}

/** Report a post, comment or profile into public.reports. */
export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (target) {
      setReason(null);
      setDetails('');
      setResult(null);
    }
  }, [target]);

  const submit = async () => {
    if (!target || !reason) return;
    setBusy(true);
    try {
      await backend.report(target, reason, details.trim());
      setResult({ ok: true, message: 'Thanks. A moderator will review it.' });
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={!!target} onClose={onClose}>
      <Text style={styles.title}>Report {target?.kind}</Text>
      {result?.ok ? (
        <>
          <Notice tone="success">{result.message}</Notice>
          <Button label="Done" variant="primary" onPress={onClose} />
        </>
      ) : (
        <ScrollView contentContainerStyle={{ gap: space.sm }}>
          {reportReasons.map((r) => (
            <Pressable
              key={r.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: reason === r.key }}
              onPress={() => setReason(r.key)}
              style={styles.item}
            >
              <Ionicons name={reason === r.key ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.accent} />
              <Text style={styles.itemText}>{r.label}</Text>
            </Pressable>
          ))}
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Details (optional)"
            placeholderTextColor={colors.muted}
            maxLength={1000}
            multiline
            style={[ui.input, { minHeight: 72 }]}
          />
          {result && <Notice tone="error">{result.message}</Notice>}
          <Button label="Send report" variant="primary" disabled={!reason} busy={busy} onPress={submit} />
          <Button label="Cancel" onPress={onClose} />
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.text, textTransform: 'capitalize' },
  item: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xs },
  itemText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
});
