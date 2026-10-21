import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import { journalEntries } from '@/data/journal';
import { samplePosts } from '@/data/posts';
import { readShareToCommunity } from '@/lib/localStore';
import { resetShareToCommunityCache } from '@/lib/shareToCommunity';

const appDir = './src/app';
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const open = (url: string) => renderRouter(appDir, { initialUrl: url });

jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

beforeEach(async () => {
  await AsyncStorage.clear();
  resetShareToCommunityCache();
});
afterAll(() => AsyncStorage.clear());

describe('Diary-first navigation', () => {
  it('opens on the Diary tab', async () => {
    await open('/');
    expect(await screen.findByText(/Log every flush/)).toBeTruthy();
    expect(screen.getByText('Save privately')).toBeTruthy();
  });

  it('shows Map · Diary · Plan · Crew · More, with no Feed tab', async () => {
    await open('/');
    await screen.findByText(/Log every flush/);
    const tabs = screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel);
    expect(tabs).toEqual(['Map', 'Plan', 'Crew', 'More']);
    expect(screen.getByLabelText('Diary: log a hunt')).toBeTruthy();
    expect(screen.queryByLabelText('Feed')).toBeNull();
    expect(screen.queryByLabelText('Community')).toBeNull();
  });
});

describe('Private by default', () => {
  it('saves a new entry as private without choosing anything', async () => {
    await open('/diary');
    await fireEvent.changeText(await screen.findByLabelText('Notes'), 'Default private entry');
    expect(screen.queryByText('Share (delayed)')).toBeNull();
    expect(screen.getByText(/Sharing is off/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save privately'));
    expect(await screen.findByText('Saved to your private log on this device.')).toBeTruthy();

    expect((await journalEntries()).some((p) => p.caption === 'Default private entry')).toBe(true);
    const page = await backend.feed(null, 50);
    expect(page.posts.some((p) => p.caption === 'Default private entry')).toBe(false);
  });
});

describe('Community feed is opt-in under Crew', () => {
  it('hides the feed until the user agrees to the community rules', async () => {
    await open('/groups?segment=community');
    expect(await screen.findByText(/Share to community is off/)).toBeTruthy();
    expect(screen.queryByText('Open community feed')).toBeNull();

    await fireEvent.press(screen.getByText('Turn on Share to community'));
    expect(screen.getByText(/Community rules/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Not now'));
    expect(screen.queryByText('Open community feed')).toBeNull();
    expect(await readShareToCommunity()).toBe(false);

    await fireEvent.press(screen.getByText('Turn on Share to community'));
    await fireEvent.press(screen.getByText('I agree, turn on sharing'));
    expect(await screen.findByText('Open community feed')).toBeTruthy();
    await waitFor(async () => expect(await readShareToCommunity()).toBe(true));

    // The feed has its own one-time rules gate (feat/report-block); accept it here.
    await backend.acceptRules();
    await fireEvent.press(screen.getByText('Open community feed'));
    expect(await screen.findByText(samplePosts()[0].caption)).toBeTruthy();
  });

  it('offers delayed sharing in the diary only after opt-in, still defaulting to private', async () => {
    await open('/profile');
    await screen.findByDisplayValue('You (sample)');
    await fireEvent.press(await screen.findByText('Turn on Share to community'));
    await fireEvent.press(await screen.findByText('I agree, turn on sharing'));
    expect(await screen.findByText(/Share to community is on/)).toBeTruthy();

    await open('/diary');
    expect(await screen.findByText('Share (delayed)')).toBeTruthy();
    expect(screen.getByText(/Private: saved only on this device/)).toBeTruthy();
  });
});
