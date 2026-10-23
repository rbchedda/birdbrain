import { StyleSheet } from 'react-native';
import { PLAN_TRIP_HINT_KEY } from '@/components/guide/PlanTripHint';
import { colors } from '@/theme/tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import { loadPlaces } from '@/data/hooks';

/** The collapsed sheet shows only "N spots nearby"; pull it up to reach the list. */
async function expandSheet() {
  const handle = await screen.findByLabelText(/^(Expand|Collapse) details$/);
  if (handle.props.accessibilityLabel === 'Expand details') await fireEvent.press(handle);
}
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
    expect(await screen.findByText('6 spots nearby')).toBeTruthy();
    expect(screen.getByTestId('place-map')).toBeTruthy();

    await expandSheet();
    await fireEvent.press(screen.getByLabelText('Managed dove field (sample C)'));
    expect(await screen.findByText(/Managed Dove Field · York County · 35 acres/)).toBeTruthy();
    expect(screen.getByText(/No Sunday hunting for migratory game birds/)).toBeTruthy();
    expect(screen.getByText('Dove')).toBeTruthy();
  });

  it('explains legal hours from the official PGC table and links the digest', async () => {
    await open('/');
    await expandSheet();
    await fireEvent.press(await screen.findByLabelText('Pheasant stocking (sample B)'));
    expect(await screen.findByTestId('place-hours-note')).toHaveTextContent(/official PGC hunting-hours table/);
    expect(screen.queryByText(/computed for this spot/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the PGC Hunting & Trapping Digest' })).toBeTruthy();
  });

  it('shows stocking windows for stocking points', async () => {
    await open('/');
    await expandSheet();
    await fireEvent.press(await screen.findByLabelText('Pheasant stocking (sample B)'));
    // Lancaster County, 1st in-season release, from the PGC allocation seed.
    expect(await screen.findByText(/1st in-season · Tue, Oct 27 – Fri, Oct 30 · 880 roosters · 330 hens/)).toBeTruthy();
    expect(screen.getByText(/county totals, not this spot/)).toBeTruthy();
  });

  it('straddling game land: release weeks follow the allocation county, header keeps the spatial county', async () => {
    const spy = jest.spyOn(backend, 'listPlaces').mockResolvedValue([
      {
        id: 'sgl-straddle', name: 'State Game Lands 999', type: 'stocking', county: 'Centre', stockingCounty: 'Clinton',
        species: ['pheasant'], center: { lng: -77.6, lat: 41.0 }, acres: null, access: 'state_game_land',
      },
    ]);
    try {
      await loadPlaces(true); // places are cached across screens; reload with the mock
      await open('/');
      await expandSheet();
    await fireEvent.press(await screen.findByLabelText('State Game Lands 999'));
      expect(await screen.findByText(/Clinton County release weeks \(county totals, not this spot\)/)).toBeTruthy();
      expect(screen.queryByText(/Centre County release weeks/)).toBeNull();
    } finally {
      spy.mockRestore();
      await act(() => loadPlaces(true));
    }
  });

  it('filters by place type and searches by county', async () => {
    await open('/');
    await screen.findByText('6 spots nearby');
    await fireEvent.press(screen.getByLabelText('Map layers'));
    await fireEvent.press(screen.getByText('Dove Fields'));
    expect(screen.getByText('1 spot nearby')).toBeTruthy();
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
    await screen.findByText('6 spots nearby');
    await fireEvent.press(screen.getByLabelText('Map layers'));
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
    await expandSheet();
    await fireEvent.press(await screen.findByLabelText('Pheasant stocking (sample E)'));
    await fireEvent.press(await screen.findByLabelText('Save privately'));
    expect(await screen.findByText('Saved')).toBeTruthy();
    const stored = JSON.parse((await AsyncStorage.getItem('birdbrain.sample.v1'))!);
    expect(stored.saved).toContain('stock-sample-2');

    await fireEvent.press(screen.getByLabelText('Back to list'));
    await fireEvent.press(screen.getByLabelText('Map layers'));
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
    await open('/feed?tab=community');
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
    await open('/feed?tab=community');
    expect(await screen.findByText(/Couldn’t check the community rules: network down/)).toBeTruthy();
    expect(screen.queryByText(samplePosts()[0].caption)).toBeNull();
    expect(screen.queryByLabelText('Loading feed')).toBeNull();
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText(samplePosts()[0].caption)).toBeTruthy();
    spy.mockRestore();
  });

  it('is linked from the feed and shows it was accepted', async () => {
    await open('/feed?tab=community');
    await fireEvent.press(await screen.findByText('Community rules'));
    expect(await screen.findByText('You’ve accepted the community rules.')).toBeTruthy();
    expect(screen.queryByText('I agree to the community rules')).toBeNull();
  });
});

describe('Feed', () => {
  it('renders visible posts with blurred areas and toggles like', async () => {
    await open('/feed?tab=community');
    const first = samplePosts()[0];
    expect(await screen.findByText(first.caption)).toBeTruthy();
    expect(screen.getByText(/Near Lancaster County/)).toBeTruthy();
    expect(screen.getByText('Flushed 5 · Roosters 3 · Bagged 1')).toBeTruthy();

    await fireEvent.press(screen.getAllByLabelText('Like')[0]);
    expect(await screen.findByText(String(first.likes + 1))).toBeTruthy();
  });

  it('reports a post', async () => {
    await open('/feed?tab=community');
    await screen.findByText(samplePosts()[1].caption);
    await fireEvent.press(screen.getAllByLabelText('Post options')[1]);
    await fireEvent.press(screen.getByText('Report post'));
    await fireEvent.press(screen.getByText('Real-time game alert'));
    await fireEvent.press(screen.getByText('Send report'));
    expect(await screen.findByText('Thanks. A moderator will review it.')).toBeTruthy();
  });

  it('blocks an author and hides their posts', async () => {
    await open('/feed?tab=community');
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
    await open('/feed?tab=community');
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

describe('Guide tab', () => {
  it('labels the tab "Guide" and shows the purpose line and the three groups (01-guide)', async () => {
    await open('/guide');
    expect(await screen.findByTestId('guide-purpose')).toHaveTextContent(
      'Everything you need to hunt PA birds legally: seasons, rules, and how to find each species.',
    );
    expect(screen.getByRole('tab', { name: 'Guide' })).toBeTruthy();
    for (const h of ['BEFORE YOU GO', 'BIRDS', 'LEARN']) expect(screen.getByRole('header', { name: h })).toBeTruthy();
    // The old Today hero, In season list and Explore grid are gone.
    expect(screen.queryByTestId('guide-today')).toBeNull();
    for (const label of ['Bird ID', 'Regulations', 'Gear checklist', 'Licenses']) expect(screen.queryByRole('button', { name: label })).toBeNull();
    // The unofficial-summary disclaimer and digest links stay, verbatim.
    expect(screen.getByTestId('guide-disclaimer')).toHaveTextContent('Unofficial summary, always verify with the PGC Hunting & Trapping Digest');
    expect(screen.getByLabelText('Open the PGC Hunting & Trapping Digest')).toBeTruthy();
    expect(screen.getByTestId('guide-digest-top')).toHaveTextContent(/Verify with the PGC digest ↗ · regs v2026-27\.3\+guide\.2/);
  });

  it.each([
    ['hours', 'Seasons & legal hours', "What's open this week and today's shooting times"],
    ['rules', 'Rules & licenses', 'Licenses, orange requirements, shot and dog rules'],
    ['trip', 'Plan a trip', "Pick a spot on the map, check the day's legal hours and weather, and save a plan."],
    ['pheasant', 'Ring-necked pheasant', 'Stocked on game lands · fields & hedgerows'],
    ['grouse', 'Ruffed grouse', 'Young forest and edges · native'],
    ['woodcock', 'American woodcock', 'Wet thickets · migratory, needs HIP'],
    ['dove', 'Mourning dove', 'Cut grain fields · split season'],
    ['basics', 'Hunting basics', 'What to bring, safety orange rules, and first-hunt tips.'],
    ['turkey', 'Wild turkey', 'Where fall flocks feed and roost, which areas are open, and how the fall season works.'],
    ['bobwhite', 'Northern bobwhite', 'Where you can hunt quail in PA, mostly release areas and preserves, plus season basics.'],
  ])('row %s has the 01-guide title and description, one tappable button', async (key, title, desc) => {
    await open('/guide');
    const row = await screen.findByTestId(`guide-row-${key}`);
    expect(row).toHaveTextContent(`${title}${desc}›`, { exact: false });
    expect(screen.getByRole('button', { name: `${title}. ${desc}` })).toBeTruthy();
  });

  it('rows are at least 64 pt and never show bag limits', async () => {
    await open('/guide');
    const rows = await screen.findAllByTestId(/^guide-row-/);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const r of rows) {
      expect(StyleSheet.flatten(r.props.style)).toEqual(expect.objectContaining({ minHeight: 64 }));
      expect(r).not.toHaveTextContent(/bag|daily|possession|limit/i);
    }
  });

  it('Data sources and Credits are small links at the bottom', async () => {
    await open('/guide');
    await fireEvent.press(await screen.findByTestId('guide-credits'));
    expect(await screen.findByText('Photo credits')).toBeTruthy();
  });

  it('disclaimer and Verify link are small muted text above Data sources and Credits, copy verbatim', async () => {
    await open('/guide');
    const disc = await screen.findByTestId('guide-disclaimer');
    const verify = screen.getByTestId('guide-digest-top');
    expect(disc).toHaveTextContent('Unofficial summary, always verify with the PGC Hunting & Trapping Digest');
    expect(verify).toHaveTextContent(/^Verify with the PGC digest ↗ · regs v/);
    for (const el of [disc, verify]) {
      const st = StyleSheet.flatten(el.props.style);
      expect(st.color).toBe(colors.muted);
      expect(st.fontSize).toBeLessThanOrEqual(13);
    }
    const all = screen.getAllByText(/./).map((n) => n.props.testID);
    expect(all.indexOf('guide-disclaimer')).toBeLessThan(all.indexOf('guide-data-sources'));
    expect(all.indexOf('guide-digest-top')).toBeLessThan(all.indexOf('guide-credits'));
  });

  it('Plan a trip opens the Map with a one-time hint, persisted in AsyncStorage', async () => {
    await AsyncStorage.removeItem(PLAN_TRIP_HINT_KEY);
    await open('/guide');
    await fireEvent.press(await screen.findByTestId('guide-row-trip'));
    expect(await screen.findByTestId('plan-trip-hint')).toHaveTextContent('Pick a spot, then tap Plan a hunt.', { exact: false });
    await waitFor(async () => expect(await AsyncStorage.getItem(PLAN_TRIP_HINT_KEY)).toBe('true'));
    await fireEvent.press(screen.getByTestId('plan-trip-hint'));
    await waitFor(() => expect(screen.queryByTestId('plan-trip-hint')).toBeNull());
  });

  it('the Plan a trip hint never shows on a plain Map open', async () => {
    await AsyncStorage.removeItem(PLAN_TRIP_HINT_KEY);
    await open('/');
    expect(await screen.findByTestId('map-top')).toBeTruthy();
    await act(async () => {});
    expect(screen.queryByTestId('plan-trip-hint')).toBeNull();
    expect(await AsyncStorage.getItem(PLAN_TRIP_HINT_KEY)).toBeNull();
  });

  it('the Plan a trip hint is not shown again once seen', async () => {
    await AsyncStorage.setItem(PLAN_TRIP_HINT_KEY, 'true');
    await open('/?hint=plan');
    expect(await screen.findByTestId('map-top')).toBeTruthy();
    await act(async () => {});
    expect(screen.queryByTestId('plan-trip-hint')).toBeNull();
  });

  it('the Data sources link opens Data sources', async () => {
    await open('/guide');
    await fireEvent.press(await screen.findByTestId('guide-data-sources'));
    expect(await screen.findByTestId('data-sources-text')).toBeTruthy();
  });

  it('Seasons & legal hours opens the PGC table; a default zone is labeled until picked', async () => {
    await open('/guide');
    await fireEvent.press(await screen.findByTestId('guide-row-hours'));
    expect(await screen.findByText(/Shooting times · PGC hours zone \d \(default\), pick yours/)).toBeTruthy();
  });

  it('shows the picked PGC hours zone after picking, and keeps it on re-open', async () => {
    await open('/guide/hours');
    await fireEvent.press(await screen.findByRole('button', { name: 'PGC hours zone 7' }));
    expect(await screen.findByText('Shooting times · PGC hours zone 7')).toBeTruthy();
    expect(screen.getByTestId('guide-bag')).toBeTruthy();
    await open('/guide/hours');
    expect(await screen.findByText('Shooting times · PGC hours zone 7')).toBeTruthy();
  });

  it('a bird row opens the species detail with dates and the limit next to a digest link', async () => {
    await open('/guide');
    await fireEvent.press(await screen.findByTestId('guide-row-pheasant'));
    expect(await screen.findByTestId('bird-seasons')).toHaveTextContent(/Oct 24/);
    expect(screen.getByTestId('bird-limits')).toHaveTextContent(/Daily: 2/);
    expect(screen.getByTestId('bird-limits-digest')).toBeTruthy();
  });

  it('Rules & licenses opens the regulations with "Buy on HuntFishPA"', async () => {
    await open('/guide');
    await fireEvent.press(await screen.findByTestId('guide-row-rules'));
    expect(await screen.findByTestId('reg-licenses')).toBeTruthy();
    expect(screen.getByTestId('guide-regs')).toBeTruthy();
    expect(screen.getByTestId('buy-huntfishpa')).toBeTruthy();
  });

  it('Hunting basics opens the per-species checklist', async () => {
    await open('/guide');
    await fireEvent.press(await screen.findByTestId('guide-row-basics'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Mourning dove' }));
    expect(screen.getByText('Gear needed · Mourning dove')).toBeTruthy();
  });

  it('bird tiles open the species detail with licensed photos and credit captions', async () => {
    await open('/guide/birds');
    await fireEvent.press(await screen.findByLabelText('Ring-necked pheasant details'));
    expect(await screen.findByTestId('bird-pheasant')).toBeTruthy();
    expect(screen.getByLabelText('Rooster photo')).toBeTruthy();
    expect(screen.getByLabelText('Hen photo')).toBeTruthy();
    expect(screen.getAllByText('Photo: Charles J. Sharp · CC BY-SA 4.0').length).toBe(2);
    expect(screen.queryByText('Placeholder · licensed photo coming')).toBeNull();
    expect(screen.getByText('Look-alikes')).toBeTruthy();
  });

  it('tapping a photo caption opens the photo credits', async () => {
    await open('/guide/bird/grouse');
    const caption = await screen.findByRole('link', { name: 'Photo credits: Photo: Rhododendrites · CC BY-SA 4.0' });
    await fireEvent.press(caption);
    expect(await screen.findByTestId('credit-ruffed-grouse.webp')).toBeTruthy();
  });

  it('the credits screen lists every image in CREDITS.json', async () => {
    const credits = require('../../assets/birds/CREDITS.json') as { file: string; title: string; author: string }[];
    await open('/guide/credits');
    expect(await screen.findByText('Photo credits')).toBeTruthy();
    for (const c of credits) {
      const card = screen.getByTestId(`credit-${c.file}`);
      expect(card).toHaveTextContent(c.title, { exact: false });
      expect(card).toHaveTextContent(c.author, { exact: false });
    }
    expect(credits.length).toBe(8);
    expect(screen.getAllByText('Source ↗')).toHaveLength(8);
    expect(screen.getAllByText('License ↗')).toHaveLength(8);
    if (credits.length === 0) expect(screen.getByTestId('credits-empty')).toBeTruthy();
  });

  it('Profile › Settings › Legal links to the photo credits', async () => {
    await open('/profile');
    await fireEvent.press(await screen.findByLabelText('Settings'));
    await fireEvent.press(await screen.findByText('Photo credits'));
    expect(await screen.findByTestId('credit-mourning-dove.webp')).toBeTruthy();
  });

  it.each(['/learn', '/plan'])('%s redirects to /guide', async (url) => {
    await open(url);
    // The Guide screen (not a 404 or the old Plan screen) renders for the old deep link.
    expect(await screen.findByTestId('guide-digest-top')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Guide', selected: true })).toBeTruthy();
  });
});

describe('After-the-hunt log', () => {
  it('shares a delayed post with per-place counts that stay private', async () => {
    await open('/new/post?placeId=stock-sample-1');
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

    await open('/feed?tab=community');
    expect(await screen.findByText('Two flushes on the creek edge')).toBeTruthy();
    expect(screen.getByText(/Delayed · others see it/)).toBeTruthy();
  });

  it('logs a hunt to the private diary by default and shows it on the profile', async () => {
    await open('/new/log?placeId=stock-sample-1');
    expect(await screen.findByText(/Private diary entry · not a post/)).toBeTruthy();
    expect(screen.getByDisplayValue('Pheasant stocking (sample B)')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More flushes'));
    await fireEvent.press(screen.getByLabelText('Add dog, weather, cover, notes, photo'));
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Scouting only');
    await fireEvent.press(screen.getByText('Save hunt'));
    expect(screen.getByText('Share this hunt later →')).toBeTruthy();
    expect(await screen.findByText(/Saved to your private log on this device/)).toBeTruthy();

    const page = await backend.feed(null, 20);
    expect(page.posts.some((p) => p.caption === 'Scouting only')).toBe(false);

    await open('/profile/hunt-log');
    expect(await screen.findByText(/1 flushes \/ 0 shots/)).toBeTruthy();
    expect(screen.getAllByText('Backed up').length).toBeGreaterThan(0);
    expect(screen.queryByText(/only on this device/)).toBeNull();
  });
});
