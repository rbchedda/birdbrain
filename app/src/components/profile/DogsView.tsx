import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Notice, ui } from '@/components/ui';
import { removeDog, saveDog } from '@/data/dogs';
import type { DogStats } from '@/data/stats';
import { colors, fonts, space } from '@/theme/tokens';

export const dogsSummary = (dogs: DogStats[]) => (dogs.length ? dogs.map((d) => d.name).join(' · ') : 'Add your dog');

/** Dog roster with per-dog points, flushes and retrieves. */
export function DogsView({ dogs, onChange }: { dogs: DogStats[]; onChange: () => void }) {
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [error, setError] = useState<string>();
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
  return (
    <View style={{ gap: space.sm }}>
      {dogs.length === 0 && <Text style={ui.muted}>No dogs yet. Add one to track points, flushes and retrieves.</Text>}
      {dogs.map((d) => (
        <View key={d.dogId} style={ui.card} testID={`dog-card-${d.name}`}>
          <Text style={styles.name}>{d.name}</Text>
          <Text style={ui.muted}>{`${d.hunts} hunts · ${d.points} pts · ${d.flushes} flushes · ${d.retrieves} retrieves · ${d.miles} mi`}</Text>
          <Button
            label={`Remove ${d.name}`}
            icon="trash-outline"
            onPress={async () => {
              await removeDog(d.dogId);
              onChange();
            }}
          />
        </View>
      ))}
      <TextInput value={name} onChangeText={setName} placeholder="Dog’s name" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="Dog name" />
      <TextInput value={breed} onChangeText={setBreed} placeholder="Breed (optional)" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="Breed" />
      {error && <Notice tone="error">{error}</Notice>}
      <Button label="Add dog" icon="paw-outline" variant="primary" onPress={add} />
      <Text style={ui.muted}>Past hunts keep a dog’s name and stats if you remove it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({ name: { fontFamily: fonts.heading, fontSize: 18, color: colors.text } });
