import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { backend } from '@/data';
import { setShareToCommunity } from '@/lib/shareToCommunity';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

const open = (url: string) => renderRouter('./src/app', { initialUrl: url });

beforeEach(async () => {
  await AsyncStorage.clear();
  await setShareToCommunity(true);
});

describe('My posts', () => {
  it('is a profile menu row that shows the author’s pending post and its go-live time', async () => {
    await open('/profile');
    expect(await screen.findByTestId('menu-my-posts')).toBeTruthy();
    expect(screen.getByLabelText(/^My posts\./)).toBeTruthy();

    const created = await backend.createPost({
      species: 'pheasant',
      caption: 'Pending from My posts test',
      huntedOn: '2026-11-09',
      counts: [{ placeId: 'stock-sample-1', placeName: 'Pheasant stocking (sample B)', flushed: 1, roosters: 0, harvested: 0 }],
      exact: { lng: -76.21, lat: 40.11 },
      location: 'blurred',
      audience: 'shared',
      groupSlug: null,
    });
    expect(new Date(created.publicAfter!).getTime()).toBeGreaterThan(Date.now());

    await open('/profile/my-posts');
    expect(await screen.findByText('Pending from My posts test')).toBeTruthy();
    expect(screen.getByText(/Goes public at/)).toBeTruthy();
    expect(screen.getByTestId('visibility')).toBeTruthy();
  });

  it('does not list other people’s posts', async () => {
    await open('/profile/my-posts');
    // Sample feed posts belong to other authors.
    expect(screen.queryByText(/First rooster of the season/)).toBeNull();
  });
});
