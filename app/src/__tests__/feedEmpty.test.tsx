import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { delayLabel } from '@/components/PostCard';
import * as crew from '@/data/crew';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
const open = (url: string) => renderRouter('./src/app', { initialUrl: url });

afterEach(async () => {
  jest.restoreAllMocks();
  crew.__resetInviteCardSession();
  await AsyncStorage.clear();
});

describe('Feed: no crew', () => {
  it('lands on Community with a slim invite card, not the full empty state', async () => {
    await open('/feed');
    expect(await screen.findByTestId('invite-card')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Community', selected: true })).toBeTruthy();
    expect(screen.queryByTestId('crew-empty')).toBeNull();
    expect(screen.queryByLabelText('My profile')).toBeNull();
    await fireEvent.press(screen.getByText('Invite'));
    expect(await screen.findByText('Start a crew')).toBeTruthy();
  });

  it('dismissing the card hides it for the session and persists it on the device', async () => {
    await open('/feed');
    await fireEvent.press(await screen.findByLabelText('Dismiss invite'));
    expect(screen.queryByTestId('invite-card')).toBeNull();
    expect(await AsyncStorage.getItem(crew.INVITE_CARD_DISMISSED_KEY)).toBe('true');
    await open('/feed');
    await screen.findByRole('tab', { name: 'Community', selected: true });
    expect(screen.queryByTestId('invite-card')).toBeNull();
    // A fresh session still remembers it from storage.
    crew.__resetInviteCardSession();
    await open('/feed');
    await screen.findByRole('tab', { name: 'Community', selected: true });
    await expect(screen.findByTestId('invite-card', {}, { timeout: 300 })).rejects.toThrow();
  });

  it('the full empty state shows only on the Crew tab', async () => {
    await open('/feed');
    await fireEvent.press(await screen.findByRole('tab', { name: 'My crew' }));
    expect(await screen.findByTestId('crew-empty')).toBeTruthy();
    expect(screen.getByText('Hunt with a crew')).toBeTruthy();
    expect(screen.queryByTestId('invite-card')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Browse Community'));
    expect(screen.getByRole('tab', { name: 'Community', selected: true })).toBeTruthy();
  });

  it('?tab=crew overrides the default', async () => {
    await open('/feed?tab=crew');
    expect(await screen.findByTestId('crew-empty')).toBeTruthy();
  });
});

describe('Feed: has a crew', () => {
  it('defaults to Crew, no invite card', async () => {
    jest.spyOn(crew, 'useCrewSize').mockReturnValue(3);
    await open('/feed');
    expect(await screen.findByRole('tab', { name: 'My crew', selected: true })).toBeTruthy();
    expect(screen.queryByTestId('invite-card')).toBeNull();
  });

  it('?tab=community overrides the Crew default', async () => {
    jest.spyOn(crew, 'useCrewSize').mockReturnValue(3);
    await open('/feed?tab=community');
    expect(await screen.findByRole('tab', { name: 'Community', selected: true })).toBeTruthy();
  });
});

describe('Post cards', () => {
  it('carry the delay instead of a banner', () => {
    const createdAt = '2026-10-20T20:00:00Z';
    expect(delayLabel({ mine: false, createdAt, publicAfter: '2026-10-21T10:00:00Z' })).toBe('shared 14 h after hunt');
    expect(delayLabel({ mine: true, createdAt, publicAfter: '2026-10-21T10:00:00Z' })).toBeNull();
    expect(delayLabel({ mine: false, createdAt, publicAfter: null })).toBeNull();
  });
});
