import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderRouter, screen } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import { locateBottom } from '@/app/(tabs)/index';
import { LOCATE_SIZE } from '@/components/map/LocateButton';
import { PENDING_CHIP_HEIGHT } from '@/components/FieldSync';
import { backend } from '@/data';
import type { Session } from '@/data/backend';
import { addJournalEntry, GUEST_AUTHOR, journalIdle, resetJournalForRestart } from '@/data/journal';
import type { PostDraft } from '@/data/types';
import { reportSignal, resetSignal } from '@/lib/connectivity';
import { chipText, resetFieldForRestart } from '@/lib/fieldDraft';
import { space } from '@/theme/tokens';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

jest.spyOn(backend, 'getSession').mockImplementation(async () => null as Session | null);
jest.spyOn(backend, 'onSessionChange').mockImplementation(() => () => {});
jest.spyOn(backend, 'upsertHuntLogEntry').mockResolvedValue({ conflict: false, version: 1 } as never);

const guest = { id: GUEST_AUTHOR, username: null, displayName: 'You' };
const draft: PostDraft = {
  species: 'pheasant', caption: 'waiting', huntedOn: '2026-10-20',
  counts: [{ placeId: null, placeName: 'SGL 211', flushed: 3, roosters: 1, harvested: 1 }],
  exact: null, location: 'hidden', audience: 'private', groupSlug: null,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  resetJournalForRestart();
  resetFieldForRestart();
  resetSignal();
});
afterAll(async () => {
  await journalIdle();
  await AsyncStorage.clear();
});

const bottomOf = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).bottom as number;

describe('locate button vs pending chip', () => {
  it('locateBottom clears the chip with a gap, and sits on the peek without it', () => {
    for (const peek of [84, 150]) {
      const chipTop = peek + space.sm + PENDING_CHIP_HEIGHT;
      expect(locateBottom(peek, true)).toBeGreaterThan(chipTop);
      expect(locateBottom(peek, false)).toBe(peek + space.lg);
    }
    expect(LOCATE_SIZE).toBeGreaterThanOrEqual(56);
  });

  it('on the map, the locate button stacks above the visible chip', async () => {
    Object.defineProperty(backend, 'mode', { value: 'supabase', configurable: true });
    await addJournalEntry(draft, guest);
    reportSignal(false);
    await renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByText(chipText(1))).toBeTruthy();
    const chipWrapBottom = StyleSheet.flatten(screen.getByTestId('pending-chip').parent!.props.style).bottom as number;
    expect(bottomOf('locate-slot')).toBeGreaterThanOrEqual(chipWrapBottom + PENDING_CHIP_HEIGHT);
    expect(screen.getByLabelText('Center map on my location')).toBeTruthy();
  });
});
