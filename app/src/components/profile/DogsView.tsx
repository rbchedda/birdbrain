import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Notice, ui } from '@/components/ui';
import { removeDog, saveDog } from '@/data/dogs';
import type { DogStats } from '@/data/stats';
import { colors, fieldTarget, fonts, radius, space } from '@/theme/tokens';

export const dogsSummary = (dogs: DogStats[]) => (dogs.length ? dogs.map((d) => d.name).join(' · ') : 'Add your dog');

/**
 * Dog roster with per-dog points, flushes and retrieves (review beta-4.4 tweak 8):
 * Remove lives in the dog's detail (tap a dog to open it) as a text button with a
 * confirm sheet, never a full-width button above the add form. Inputs have visible labels.
 */
export function DogsView({ dogs, onChange }: { dogs: DogStats[]; onChange: () => void }) {
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<DogStats | null>(null);
  const add = async () => {
    try {
      await saveDog({ name, breed });
      setName('');
      setBreed('');
      setError(undefined);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async (d: DogStats) => {
    setConfirm(null);
    setOpen(null);
    await removeDog(d.dogId);
    onChange();
  };
  return (
    <View style={{ gap: space.sm }}>
      {dogs.length === 0 && (
        <View style={styles.empty} testID="dogs-empty">
          <View style={styles.emptyIcon}>
            <Ionicons name="paw" size={32} color={colors.dove} />
          </View>
          <Text style={styles.emptyTitle} accessibilityRole="header">Add your dog</Text>
          <Text style={styles.emptyBody}>Tag a dog on a hunt to track points, flushes and retrieves.</Text>
        </View>
      )}
      {dogs.map((d) => {
        const expanded = open === d.dogId;
        return (
          <View key={d.dogId} style={ui.card} testID={`dog-card-${d.name}`}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${d.name}. ${expanded ? 'Hide details' : 'Show details'}`}
              onPress={() => setOpen(expanded ? null : d.dogId)}
              style={styles.dogHead}
              testID={`dog-open-${d.name}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{d.name}</Text>
                <Text style={ui.muted}>{`${d.hunts} hunts · ${d.points} pts · ${d.flushes} flushes · ${d.retrieves} retrieves · ${d.miles} mi`}</Text>
              </View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
            </Pressable>
            {expanded && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${d.name}`} onPress={() => setConfirm(d)} style={styles.removeRow} testID={`dog-remove-${d.name}`}>
                <Text style={styles.removeText}>{`Remove ${d.name}`}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <View style={styles.field}>
        <Text style={styles.label} nativeID="dog-name-label">Dog’s name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Ruby" placeholderTextColor={colors.muted} style={styles.input} accessibilityLabel="Dog’s name" accessibilityLabelledBy="dog-name-label" testID="dog-name-input" />
      </View>
      <View style={styles.field}>
        <Text style={styles.label} nativeID="dog-breed-label">Breed (optional)</Text>
        <TextInput value={breed} onChangeText={setBreed} placeholder="e.g. English setter" placeholderTextColor={colors.muted} style={styles.input} accessibilityLabel="Breed (optional)" accessibilityLabelledBy="dog-breed-label" testID="dog-breed-input" />
      </View>
      {error && <Notice tone="error">{error}</Notice>}
      <Button label="Add dog" variant="primary" onPress={add} style={{ minHeight: fieldTarget }} testID="dog-add" />
      {dogs.length > 0 && <Text style={ui.muted}>Past hunts keep a dog’s name and stats if you remove it.</Text>}

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirm(null)} accessibilityLabel="Cancel" accessibilityRole="button" />
        <View style={styles.sheet} testID="dog-remove-confirm" accessibilityViewIsModal>
          <Text style={styles.sheetTitle}>{confirm ? `Remove ${confirm.name}?` : ''}</Text>
          <Text style={ui.muted}>Past hunts keep the name.</Text>
          <Button label={confirm ? `Remove ${confirm.name}` : 'Remove'} variant="danger" onPress={() => confirm && void remove(confirm)} style={{ minHeight: fieldTarget }} testID="dog-remove-yes" />
          <Button label="Cancel" onPress={() => setConfirm(null)} style={{ minHeight: fieldTarget }} testID="dog-remove-cancel" />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  dogHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: fieldTarget },
  removeRow: { minHeight: fieldTarget, justifyContent: 'center' },
  removeText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.accent },
  field: { gap: 6 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.subtle },
  input: { minHeight: fieldTarget, borderRadius: radius.md, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.lg, color: colors.text, fontFamily: fonts.body, fontSize: 16 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  emptyIcon: { width: 72, height: 72, borderRadius: 16, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.text },
  emptyBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.subtle, textAlign: 'center' },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, paddingBottom: space.xxl, gap: space.sm },
});
