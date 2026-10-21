import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Notice, ui } from '@/components/ui';
import { setShareToCommunity, useShareToCommunity } from '@/lib/shareToCommunity';
import { space } from '@/theme/tokens';

const rules = [
  'Shared entries post after a delay of at least 12 hours. Nothing posts live: PA law bars real-time game alerts.',
  'Locations are blurred to an area. Your exact spots and places stay private.',
  'No harassment, no spot-burning, no graphic content. Report anything that breaks these rules.',
];

/**
 * "Share to community" setting. Off by default; turning it on is a deliberate
 * one-time choice that shows the community rules first.
 */
export function CommunityOptIn() {
  const sharing = useShareToCommunity();
  const [reviewing, setReviewing] = useState(false);

  if (sharing) {
    return (
      <View style={{ gap: space.sm }} testID="community-opt-in">
        <Text style={ui.body}>Share to community is on. New entries are still private unless you pick “Share (delayed)”.</Text>
        <Button label="Turn off sharing" icon="lock-closed-outline" onPress={() => setShareToCommunity(false)} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }} testID="community-opt-in">
      <Text style={ui.muted}>Share to community is off. Your diary is private and the community feed is hidden.</Text>
      {!reviewing ? (
        <Button label="Turn on Share to community" icon="people-outline" onPress={() => setReviewing(true)} />
      ) : (
        <>
          <Notice>
            {'Community rules\n'}
            {rules.map((r) => `• ${r}`).join('\n')}
          </Notice>
          <Button label="I agree, turn on sharing" variant="primary" onPress={() => setShareToCommunity(true)} />
          <Button label="Not now" onPress={() => setReviewing(false)} />
        </>
      )}
    </View>
  );
}
