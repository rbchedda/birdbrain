import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { backend } from '@/data';
import { readShareToCommunity } from '@/lib/localStore';
import { resetShareToCommunityCache, setShareToCommunity } from '@/lib/shareToCommunity';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

const open = (url: string) => renderRouter('./src/app', { initialUrl: url });

beforeEach(async () => {
  await AsyncStorage.clear();
  resetShareToCommunityCache();
});

describe('Share to community opt-in', () => {
  it('is off by default', async () => {
    expect(await readShareToCommunity()).toBe(false);
  });

  it('Post shows only the opt-in until sharing is turned on', async () => {
    const createPost = jest.spyOn(backend, 'createPost');
    await open('/new/post');
    expect(await screen.findByText(/Share to community is off/)).toBeTruthy();
    expect(screen.queryByText('Share (delayed)')).toBeNull();
    expect(screen.queryByText(/Share tomorrow/)).toBeNull();
    expect(createPost).not.toHaveBeenCalled();
    createPost.mockRestore();
  });

  it('turning it on shows the community rules first, then unlocks Post and persists', async () => {
    await open('/new/post');
    await fireEvent.press(await screen.findByText('Turn on Share to community'));
    expect(screen.getByText(/Community rules/)).toBeTruthy();
    expect(screen.queryByText('Share (delayed)')).toBeNull();
    await fireEvent.press(screen.getByText('I agree, turn on sharing'));
    expect(await screen.findByText('Share (delayed)')).toBeTruthy();
    expect(await readShareToCommunity()).toBe(true);
  });

  it('"Not now" keeps sharing off', async () => {
    await open('/new/post');
    await fireEvent.press(await screen.findByText('Turn on Share to community'));
    await fireEvent.press(screen.getByText('Not now'));
    expect(screen.getByText(/Share to community is off/)).toBeTruthy();
    expect(await readShareToCommunity()).toBe(false);
  });

  it('can be turned on and off from Settings', async () => {
    await open('/profile/settings');
    expect(await screen.findByText(/Share to community is off/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Turn on Share to community'));
    await fireEvent.press(screen.getByText('I agree, turn on sharing'));
    expect(await screen.findByText(/Share to community is on/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Turn off sharing'));
    expect(await screen.findByText(/Share to community is off/)).toBeTruthy();
    expect(await readShareToCommunity()).toBe(false);
  });

  it('a saved opt-in is read back after restart', async () => {
    await setShareToCommunity(true);
    resetShareToCommunityCache();
    await open('/new/post');
    expect(await screen.findByText('Share (delayed)')).toBeTruthy();
  });

  it('Log hunt stays private even when sharing is on', async () => {
    await setShareToCommunity(true);
    await open('/new/log');
    expect(await screen.findByText(/Private diary entry · not a post/)).toBeTruthy();
    expect(screen.queryByText('Share (delayed)')).toBeNull();
  });
});
