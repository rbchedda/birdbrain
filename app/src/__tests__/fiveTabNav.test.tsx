import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { backend } from '@/data';
import { journalEntries } from '@/data/journal';

const appDir = './src/app';
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const open = (url: string) => renderRouter(appDir, { initialUrl: url });

jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

afterAll(() => AsyncStorage.clear());

const tabBar = () =>
  screen
    .getAllByRole(/^(tab|button)$/)
    .map((el) => el.props.accessibilityLabel as string)
    .filter((l) => ['Map', 'Feed', 'New: log a hunt or post', 'Guide', 'Profile'].includes(l));

describe('Five-tab nav', () => {
  it('launches on Map with tabs Map | Feed | ＋ | Guide | Profile', async () => {
    await open('/');
    expect(await screen.findByText('6 spots nearby')).toBeTruthy();
    expect(tabBar()).toEqual(['Map', 'Feed', 'New: log a hunt or post', 'Guide', 'Profile']);
    for (const gone of ['Plan', 'Learn', 'Crew', 'Log']) expect(screen.queryByRole('tab', { name: gone })).toBeNull();
  });

  it.each([
    ['/feed', /Invite your crew/],
    ['/guide', /BEFORE YOU GO/],
    ['/profile', /Hunt diary/],
    ['/log', /Private diary entry · not a post/],
    ['/new/log', /Private diary entry · not a post/],
    ['/new/post', /Share with hunters\. Delayed/],
    ['/groups', /Species groups across Pennsylvania/],
    ['/new', /What are you adding\?/],
  ])('deep link %s opens its screen', async (url, text) => {
    await open(url);
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
  });
});

describe('Old routes redirect to Guide', () => {
  it.each(['/learn', '/plan'])('%s redirects to the Guide tab', async (url) => {
    await open(url);
    expect(await screen.findByTestId('guide-purpose')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Guide' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Guide', selected: true })).toBeTruthy();
  });
});

describe('＋ chooser', () => {
  it('opens from the center button and offers Log hunt and Post', async () => {
    await open('/');
    await screen.findByText('6 spots nearby');
    await fireEvent.press(screen.getByLabelText('New: log a hunt or post'));
    expect(await screen.findByText(/What are you adding\?/)).toBeTruthy();
    expect(screen.getByText(/Never posted\. Only you see it\./)).toBeTruthy();
    expect(screen.getByText(/Appears 12\+ hrs after the hunt/)).toBeTruthy();
  });

  it('Log hunt routes to the private log with no sharing option', async () => {
    await open('/new');
    await fireEvent.press(await screen.findByLabelText('Log hunt'));
    expect(await screen.findByText(/Private diary entry · not a post/)).toBeTruthy();
    expect(screen.queryByText('Share (delayed)')).toBeNull();
    expect(screen.getByText('Save hunt')).toBeTruthy();
  });

  it('Post routes to the delayed post flow', async () => {
    await open('/new');
    await fireEvent.press(await screen.findByLabelText('Post'));
    expect(await screen.findByText('Share (delayed)')).toBeTruthy();
    expect(screen.getByText(/Delayed: only you see it until/)).toBeTruthy();
  });

  it('Cancel closes the chooser', async () => {
    await open('/');
    await screen.findByText('6 spots nearby');
    await fireEvent.press(screen.getByLabelText('New: log a hunt or post'));
    await fireEvent.press(await screen.findByText('Cancel'));
    expect(screen.queryByText(/What are you adding\?/)).toBeNull();
  });
});

describe('Log hunt never creates a post', () => {
  it('saves to the private journal and never calls createPost', async () => {
    const createPost = jest.spyOn(backend, 'createPost');
    await open('/new');
    await fireEvent.press(await screen.findByLabelText('Log hunt'));
    await fireEvent.press(await screen.findByLabelText('Add dog, weather, cover, notes, photo'));
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Chooser private hunt');
    await fireEvent.press(screen.getByText('Save hunt'));
    expect(await screen.findByText(/Saved to your private log on this device/)).toBeTruthy();

    expect(createPost).not.toHaveBeenCalled();
    expect((await journalEntries()).some((p) => p.caption === 'Chooser private hunt')).toBe(true);
    const page = await backend.feed(null, 50);
    expect(page.posts.some((p) => p.caption === 'Chooser private hunt')).toBe(false);
    createPost.mockRestore();
  });

  it('/new/log ignores a mode=post param', async () => {
    await open('/new/log?mode=post');
    expect(await screen.findByText(/Private diary entry · not a post/)).toBeTruthy();
    expect(screen.queryByText('Share (delayed)')).toBeNull();
  });

  it('a /log deep link with a place is still private', async () => {
    const createPost = jest.spyOn(backend, 'createPost');
    await open('/log?placeId=stock-sample-1');
    expect(await screen.findByDisplayValue('Pheasant stocking (sample B)')).toBeTruthy();
    expect(screen.queryByText('Share (delayed)')).toBeNull();
    await fireEvent.press(screen.getByText('Save hunt'));
    expect(await screen.findByText(/Saved to your private log on this device/)).toBeTruthy();
    expect(createPost).not.toHaveBeenCalled();
    createPost.mockRestore();
  });

  it('Profile shows private diary entries, never posts', async () => {
    await open('/profile');
    expect(await screen.findByText('Hunt diary')).toBeTruthy();
    expect(screen.getAllByText('🔒 Private').length).toBeGreaterThan(0);
  });
});
