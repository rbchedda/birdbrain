import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, ui } from '@/components/ui';
import { space } from '@/theme/tokens';

export function SignInPrompt({ why }: { why: string }) {
  return (
    <View style={[ui.card, { margin: space.lg }]}>
      <Text style={ui.body}>{why}</Text>
      <Button label="Sign in or create an account" variant="primary" onPress={() => router.push('/sign-in')} />
    </View>
  );
}
