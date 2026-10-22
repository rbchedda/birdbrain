import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Share } from 'react-native';

import { delayLabel } from '@/components/PostCard';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
afterAll(() => AsyncStorage.clear());

describe('Feed empty state (redesign 03)', () => {
  it('opens on My crew with one headline, one primary action, QR link and Community card', async () => {
    await renderRouter('./src/app', { initialUrl: '/feed' });
    expect(await screen.findByText('Hunt with a crew')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'My crew', selected: true })).toBeTruthy();
    expect(screen.getByText(/12\+ hours after the hunt, with no live locations/)).toBeTruthy();
    expect(screen.getByText('Show a QR code instead')).toBeTruthy();
    expect(screen.queryByLabelText('My profile')).toBeNull();
    expect(screen.queryByText(/Hunts from yesterday and before/)).toBeNull();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await fireEvent.press(screen.getByText('Invite your crew'));
    expect(share).toHaveBeenCalled();
    share.mockRestore();
  });

  it('Browse Community switches to the community feed', async () => {
    await renderRouter('./src/app', { initialUrl: '/feed' });
    await fireEvent.press(await screen.findByLabelText('Browse Community'));
    expect((await screen.findAllByText(/community rules/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Community', selected: true })).toBeTruthy();
    expect(screen.queryByTestId('crew-empty')).toBeNull();
  });

  it('cards carry the delay instead of a banner', () => {
    const createdAt = '2026-10-20T20:00:00Z';
    expect(delayLabel({ mine: false, createdAt, publicAfter: '2026-10-21T10:00:00Z' })).toBe('shared 14 h after hunt');
    expect(delayLabel({ mine: true, createdAt, publicAfter: '2026-10-21T10:00:00Z' })).toBeNull();
    expect(delayLabel({ mine: false, createdAt, publicAfter: null })).toBeNull();
  });
});
