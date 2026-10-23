import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button, Chip, Notice, ui } from '@/components/ui';
import { saveUsername, validateUsername } from '@/lib/username';
import { colors, space } from '@/theme/tokens';

/** One field + Save; optional Skip. Used by the post-sign-in step and the Profile edit. */
export function UsernameForm({
  initial = '',
  onSaved,
  onSkip,
  skipLabel = 'Skip for now',
}: {
  initial?: string;
  onSaved: (username: string) => void;
  onSkip?: () => void;
  skipLabel?: string;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const save = async () => {
    const invalid = validateUsername(value);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(undefined);
    try {
      onSaved(await saveUsername(value));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <TextInput
        value={value}
        onChangeText={(t) => {
          setValue(t);
          setError(undefined);
        }}
        placeholder="username"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        style={ui.input}
        accessibilityLabel="Username"
        onSubmitEditing={save}
      />
      <Text style={ui.muted}>3–20 letters, numbers or underscores.</Text>
      {error && <Notice tone="error">{error}</Notice>}
      <Button label="Save" variant="primary" busy={busy} disabled={!value.trim()} onPress={save} />
      {onSkip && <Chip label={skipLabel} onPress={onSkip} />}
    </View>
  );
}
