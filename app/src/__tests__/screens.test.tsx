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

  it('explains legal hours from the official PGC table and links the digest', async () => {
    await open('/');
    await fireEvent.press(await screen.findByLabelText('Pheasant stocking (sample B)'));
    expect(await screen.findByTestId('place-hours-note')).toHaveTextContent(/official PGC hunting-hours table/);
    expect(screen.queryByText(/computed for this spot/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the PGC Hunting & Trapping Digest' })).toBeTruthy();
  });

  it('shows stocking windows for stocking points', async () => {
    await open('/');
    await fireEvent.press(await screen.findByLabelText('Pheasant stocking (sample B)'));
    // Lancaster County, 1st in-season release, from the PGC allocation seed.
    expect(await screen.findByText(/1st in-season · Tue, Oct 27 – Fri, Oct 30 · 880 roosters · 330 hens/)).toBeTruthy();
    expect(screen.getByText(/county totals, not this spot/)).toBeTruthy();
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

describe('Stocking planner', () => {
  it('opens from the map with the disclaimer, PGC link, points, dove fields and tips', async () => {
    await open('/');
    await screen.findByText('6 public spots');
    await fireEvent.press(screen.getByText('Stocking planner'));
    expect(await screen.findByTestId('stocking-disclaimer')).toHaveTextContent(/Always verify with PGC/);
    expect(screen.getByRole('link', { name: 'Open PGC pheasant allocation' })).toBeTruthy();
    expect(screen.getByTestId('stocking-row-stock-sample-1')).toBeTruthy();
    expect(screen.getByTestId('stocking-row-stock-sample-2')).toBeTruthy();
    expect(screen.getByText('Managed dove field (sample C)')).toBeTruthy();
    expect(screen.getByText('Crowding tips')).toBeTruthy();
    expect(screen.getByText(/BirdBrain never uses your live location/)).toBeTruthy();
  });

  it('saves a site, which persists and becomes a distance origin', async () => {
    await open('/');
    await fireEvent.press(await screen.findByLabelText('Pheasant stocking (sample E)'));
    await fireEvent.press(await screen.findByText('Save privately'));
    expect(await screen.findByText('Saved')).toBeTruthy();
    const stored = JSON.parse((await AsyncStorage.getItem('birdbrain.sample.v1'))!);
    expect(stored.saved).toContain('stock-sample-2');

    await fireEvent.press(screen.getByLabelText('Back to list'));
    await fireEvent.press(screen.getByText('Stocking planner'));
    await fireEvent.press(await screen.findByText('Saved only'));
    expect(screen.getByTestId('stocking-row-stock-sample-2')).toBeTruthy();
    expect(screen.queryByTestId('stocking-row-stock-sample-1')).toBeNull();
    await fireEvent.press(screen.getByText('Saved only'));
    expect(screen.getAllByText('Pheasant stocking (sample E)').length).toBeGreaterThan(1); // row + Near chip
    await backend.setPlaceSaved('stock-sample-2', false);
  });
});

describe('Community rules', () => {
  it('gates the feed until the rules are accepted, once', async () => {
    expect(await backend.rulesAccepted()).toBe(false);
    await open('/feed');
    expect(await screen.findByText(/please read and accept the community rules/)).toBeTruthy();
    expect(screen.queryByText(samplePosts()[0].caption)).toBeNull();
    await fireEvent.press(screen.getByText('Read community rules'));
    expect(await screen.findByText(/zero tolerance for objectionable content/)).toBeTruthy();
    await fireEvent.press(screen.getByText('I agree to the community rules'));
    expect(await screen.findByText(samplePosts()[0].caption)).toBeTruthy();
    expect(await backend.rulesAccepted()).toBe(true);
  });

  it('fails closed with a retry when the rules check errors', async () => {
    const spy = jest.spyOn(backend, 'rulesAccepted').mockRejectedValueOnce(new Error('network down'));
    await open('/feed');
    expect(await screen.findByText(/Couldn’t check the community rules: network down/)).toBeTruthy();
    expect(screen.queryByText(samplePosts()[0].caption)).toBeNull();
    expect(screen.queryByLabelText('Loading feed')).toBeNull();
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText(samplePosts()[0].caption)).toBeTruthy();
    spy.mockRestore();
  });

  it('is linked from the feed and shows it was accepted', async () => {
    await open('/feed');
    await fireEvent.press(await screen.findByText('Community rules'));
    expect(await screen.findByText('You’ve accepted the community rules.')).toBeTruthy();
    expect(screen.queryByText('I agree to the community rules')).toBeNull();
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

describe('Report and block on posts, comments and profiles', () => {
  it('offers the hate reason and refuses a duplicate report', async () => {
    await open('/feed');
    await screen.findByText(samplePosts()[2].caption);
    await fireEvent.press(screen.getAllByLabelText('Post options')[2]);
    await fireEvent.press(screen.getByText('Report post'));
    await fireEvent.press(screen.getByText('Hate speech or slurs'));
    await fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks. A moderator will review it.')).toBeTruthy();
    await expect(backend.report({ kind: 'post', id: samplePosts()[2].id }, 'spam')).rejects.toThrow('You already reported this.');
  });

  it('reports a comment and blocks its author from the post screen', async () => {
    await open('/post/p1');
    const c = await screen.findByText('Great dog work!');
    expect(c).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText('Comment options')[0]);
    await fireEvent.press(screen.getByText('Report comment'));
    await fireEvent.press(screen.getByText('Harassment'));
    await fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks. A moderator will review it.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Done'));

    await fireEvent.press(screen.getAllByLabelText('Comment options')[0]);
    const block = screen.getByText(/^Block /);
    const blockedName = String(block.props.children).replace('Block ', '');
    await fireEvent.press(block);
    await waitFor(() => expect(screen.queryByText('Great dog work!')).toBeNull());
    const blocked = await backend.blockedUsers();
    expect(blocked.map((a) => a.displayName)).toContain(blockedName);
    for (const a of blocked) await backend.setBlocked(a.id, false);
  });

  it('rejects an objectionable comment', async () => {
    await open('/post/p1');
    await screen.findByText('Great dog work!');
    await fireEvent.changeText(screen.getByLabelText('Add a comment'), 'what a FUCKING bird');
    await fireEvent.press(screen.getByText('Comment'));
    expect(await screen.findByText(/objectionable content/)).toBeTruthy();
    expect(screen.queryByText('what a FUCKING bird', { exact: true })).toBeNull();
  });

  it('reports and blocks from a hunter profile', async () => {
    const sam = samplePosts()[3];
    await open(`/user/${sam.author.id}`);
    expect(await screen.findByText(sam.caption)).toBeTruthy();
    await fireEvent.press(screen.getByText('Report'));
    await fireEvent.press(screen.getByText('Spam'));
    await fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks. A moderator will review it.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Done'));
    await fireEvent.press(screen.getByText('Block'));
    expect(await screen.findByText(/Blocked\. Neither of you/)).toBeTruthy();
    expect(screen.queryByText(sam.caption)).toBeNull();
    await backend.setBlocked(sam.author.id, false);
  });
});

describe('Plan tab', () => {
  it('shows the Open today card with the PGC link', async () => {
    await open('/plan');
    expect(await screen.findByText('Open today?')).toBeTruthy();
    expect(screen.getByLabelText('Open the PGC Hunting & Trapping Digest')).toBeTruthy();
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

  it('saves a private entry locally first and shows its backup status', async () => {
    await open('/log');
    await fireEvent.changeText(await screen.findByLabelText('Notes'), 'Scouting only');
    await fireEvent.press(screen.getByText('Private'));
    expect(screen.getByText(/only you can see it/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save privately'));
    expect(await screen.findByText(/Saved to your private log on this device/)).toBeTruthy();
    expect(await screen.findByText('Backed up')).toBeTruthy();

    const page = await backend.feed(null, 20);
    expect(page.posts.some((p) => p.caption === 'Scouting only')).toBe(false);

    await open('/profile');
    expect(await screen.findByText('Scouting only')).toBeTruthy();
    expect(screen.getByText('Private · only on this device')).toBeTruthy();
  });
});
