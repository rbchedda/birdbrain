import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import { samplePosts } from '@/data/posts';

const appDir = './src/app';
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const open = (url: string) => renderRouter(appDir, { initialUrl: url });

jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

afterAll(() => AsyncStorage.clear());

it('falls back to sample data when Supabase env vars are unset', () => {
  expect(backend.mode).toBe('sample');
});

describe('Map (Pheasant Planner)', () => {
  it('lists places and shows land info and today’s status for a selection', async () => {
    await open('/');
    expect(await screen.findByText('6 public spots')).toBeTruthy();
    expect(screen.getByTestId('place-map')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Managed dove field (sample C)'));
    expect(await screen.findByText(/Managed Dove Field · York County · 35 acres/)).toBeTruthy();
    expect(screen.getByText(/No Sunday hunting for migratory game birds/)).toBeTruthy();
    expect(screen.getByText('Dove')).toBeTruthy();
  });

  it('shows stocking windows for stocking points', async () => {
    await open('/');
    await fireEvent.press(await screen.findByLabelText('Pheasant stocking (sample B)'));
    expect(await screen.findByText(/Oct 19 – .*Oct 23 · 400 roosters/)).toBeTruthy();
  });

  it('filters by place type and searches by county', async () => {
    await open('/');
    await screen.findByText('6 public spots');
    await fireEvent.press(screen.getByText('Dove Fields'));
    expect(screen.getByText('1 public spot')).toBeTruthy();
    expect(screen.queryByLabelText('State Game Lands (sample A)')).toBeNull();

    await fireEvent.press(screen.getByText('All'));
    await fireEvent.changeText(screen.getByLabelText('Search places'), 'clinton');
    expect(screen.getByLabelText('State Game Lands (sample F)')).toBeTruthy();
    expect(screen.queryByLabelText('State Game Lands (sample A)')).toBeNull();
  });
});

describe('Feed', () => {
  it('renders visible posts with blurred areas and toggles like', async () => {
    await open('/feed');
    const first = samplePosts()[0];
    expect(await screen.findByText(first.caption)).toBeTruthy();
    expect(screen.getByText(/Near Lancaster County/)).toBeTruthy();
    expect(screen.getByText('Flushed 5 · Roosters 3 · Bagged 1')).toBeTruthy();

    await fireEvent.press(screen.getAllByLabelText('Like')[0]);
    expect(await screen.findByText(String(first.likes + 1))).toBeTruthy();
  });

  it('reports a post', async () => {
    await open('/feed');
    await screen.findByText(samplePosts()[1].caption);
    await fireEvent.press(screen.getAllByLabelText('Post options')[1]);
    await fireEvent.press(screen.getByText('Report post'));
    await fireEvent.press(screen.getByText('Real-time game alert'));
    await fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks. A moderator will review it.')).toBeTruthy();
  });

  it('blocks an author and hides their posts', async () => {
    await open('/feed');
    const sam = samplePosts()[3];
    await screen.findByText(sam.caption);
    await fireEvent.press(screen.getAllByLabelText('Post options')[3]);
    await fireEvent.press(screen.getByText('Block Sam W.'));
    await waitFor(() => expect(screen.queryByText(sam.caption)).toBeNull());
    expect(screen.getByText(/Blocked\. You won’t see each other’s posts/)).toBeTruthy();
    await backend.setBlocked(sam.author.id, false);
  });

  it('opens a post with its comments and adds one', async () => {
    await open('/post/p1');
    expect(await screen.findByText('Great dog work!')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Add a comment'), 'Congrats on the rooster');
    await fireEvent.press(screen.getByText('Comment'));
    expect(await screen.findByText('Congrats on the rooster')).toBeTruthy();
  });
});

describe('After-the-hunt log', () => {
  it('shares a delayed post with per-place counts that stay private', async () => {
    await open('/log?placeId=stock-sample-1');
    expect(await screen.findByText('Pheasant stocking (sample B)')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More flushed'));
    await fireEvent.press(screen.getByLabelText('More flushed'));
    await fireEvent.press(screen.getByLabelText('More roosters'));
    await fireEvent.press(screen.getByLabelText('More harvested'));
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Two flushes on the creek edge');
    expect(screen.getByText(/Delayed: only you see it until/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Share tomorrow (12h+ delay)'));
    expect(await screen.findByText(/Posted\. Others will see it from/)).toBeTruthy();

    const page = await backend.feed(null, 20);
    const mine = page.posts.find((p) => p.caption === 'Two flushes on the creek edge')!;
    expect(mine).toMatchObject({
      mine: true,
      kind: 'harvest',
      species: 'pheasant',
      counts: { flushed: 2, roosters: 1, harvested: 1 },
      // Blurred to the ~5 km grid cell, never the place itself.
      area: { lng: -76.225, lat: 40.125 },
    });
    expect(new Date(mine.publicAfter!).getTime()).toBeGreaterThan(Date.now());

    await open('/feed');
    expect(await screen.findByText('Two flushes on the creek edge')).toBeTruthy();
    expect(screen.getByText(/Delayed · others see it/)).toBeTruthy();
  });

  it('saves a private entry to the device only', async () => {
    await open('/log');
    await fireEvent.changeText(await screen.findByLabelText('Notes'), 'Scouting only');
    await fireEvent.press(screen.getByText('Private'));
    expect(screen.getByText(/Nothing is uploaded/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save privately'));
    expect(await screen.findByText('Saved to your private log on this device.')).toBeTruthy();

    const page = await backend.feed(null, 20);
    expect(page.posts.some((p) => p.caption === 'Scouting only')).toBe(false);

    await open('/profile');
    expect(await screen.findByText('Scouting only')).toBeTruthy();
    expect(screen.getByText('Private · only on this device')).toBeTruthy();
  });
});
