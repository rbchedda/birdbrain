import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { backend } from '@/data';
import { journalEntries } from '@/data/journal';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const open = (url: string) => renderRouter('./src/app', { initialUrl: url });

jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

let mockSignedOut = false;
jest.mock('@/data/hooks', () => {
  const real = jest.requireActual('@/data/hooks');
  return { ...real, useSession: () => (mockSignedOut ? null : real.useSession()) };
});


afterEach(async () => {
  mockSignedOut = false;
  await AsyncStorage.clear();
});

describe('Log hunt sheet (redesign 02)', () => {
  it('shows essentials above the fold and defers details behind one row', async () => {
    await open('/new/log?placeId=stock-sample-1');
    expect(await screen.findByText(/Private diary entry · not a post/)).toBeTruthy();
    expect(screen.getByText('Where & when')).toBeTruthy();
    expect(screen.getByDisplayValue('Pheasant stocking (sample B)')).toBeTruthy();
    expect(screen.getByLabelText('More flushes')).toBeTruthy();
    expect(screen.getByLabelText('More harvested')).toBeTruthy();
    expect(screen.getByTestId('sticky-save')).toBeTruthy();
    for (const hidden of ['Notes', 'Temperature', 'New dog name', 'More shots']) expect(screen.queryByLabelText(hidden)).toBeNull();
    for (const gone of ['Who sees it', 'Your private log', 'Share (delayed)', 'Share later']) expect(screen.queryByText(gone)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add dog, weather, cover, notes, photo'));
    expect(screen.getByLabelText('Notes')).toBeTruthy();
    expect(screen.getByLabelText('Temperature')).toBeTruthy();
  });

  it('shows top 3 species with More…, and Harvested counts the bag', async () => {
    await open('/new/log?placeId=stock-sample-1');
    await screen.findByText('Where & when');
    expect(screen.queryByText('Waterfowl')).toBeNull();
    await fireEvent.press(screen.getByText('More…'));
    expect(screen.getByText('Waterfowl')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More harvested'));
    await fireEvent.press(screen.getByLabelText('More harvested'));
    await fireEvent.press(screen.getByText('Save hunt'));
    expect(await screen.findByText('Share this hunt later →')).toBeTruthy();
    const [e] = await journalEntries();
    expect(e.details?.birds[0]).toMatchObject({ species: 'pheasant', roosters: 2, count: 2 });
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
    expect(screen.queryByText('Woodcock')).toBeNull();
  });

  it('signed out: Save keeps the entry on the phone and shows the one sign-in sheet, without Not now', async () => {
    mockSignedOut = true;
    await open('/new/log?placeId=stock-sample-1');
    expect(await screen.findByText(/First save\? You’ll create a free account/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save hunt'));
    expect(await screen.findByText('Sign in to save this hunt')).toBeTruthy();
    expect(screen.getByText('Pheasant stocking (sample B) · Pheasant')).toBeTruthy();
    expect((await journalEntries()).length).toBe(1);
    expect(screen.queryByText('Not now — keep on this phone only')).toBeNull();
  });
});
