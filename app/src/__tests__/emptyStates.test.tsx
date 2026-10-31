import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent as fe, render } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { act } from 'react';

import { EmptyState, ErrorState, OfflineBanner, stateColors } from '@/components/States';
import { backend } from '@/data';
import * as crew from '@/data/crew';
import { reportSignal, resetSignal } from '@/lib/connectivity';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
const open = (url: string) => renderRouter('./src/app', { initialUrl: url });
const offline = () => act(() => reportSignal(false));

beforeEach(() => resetSignal());
afterEach(async () => {
  jest.restoreAllMocks();
  crew.__resetInviteCardSession();
  resetSignal();
  await AsyncStorage.clear();
});

describe('shared state patterns', () => {
  it('EmptyState: title, body, primary + secondary actions', async () => {
    const go = jest.fn();
    const back = jest.fn();
    const sc = await render(<EmptyState testID="e" icon="leaf-outline" title="Nothing here" body="Body copy" action={{ label: 'Go', onPress: go }} secondary={{ label: 'Back', onPress: back }} />);
    expect(sc.getByTestId('e')).toHaveTextContent(/Nothing here/);
    await fe.press(sc.getByText('Go'));
    await fe.press(sc.getByText('Back'));
    expect(go).toHaveBeenCalled();
    expect(back).toHaveBeenCalled();
  });
  it('OfflineBanner prefixes "No signal · " in the amber palette', async () => {
    const sc = await render(<OfflineBanner>reading saved posts.</OfflineBanner>);
    expect(sc.getByTestId('offline-banner')).toHaveTextContent(/No signal · reading saved posts\./);
    expect(stateColors).toMatchObject({ offlineBg: '#2a2416', offlineBorder: '#6b5a2c', offlineText: '#E8C468', errorBg: '#33201a', skeleton: '#1f3328' });
  });
  it('ErrorState shows reassurance and a Try again button', async () => {
    const retry = jest.fn();
    const sc = await render(<ErrorState title="Couldn’t load." reassurance="Your hunts are safe." onRetry={retry} />);
    expect(sc.getByTestId('error-state')).toHaveTextContent(/Your hunts are safe/);
    await fe.press(sc.getByTestId('error-state-retry'));
    expect(retry).toHaveBeenCalled();
  });
});

describe('Feed states', () => {
  it('shows an error card with Try again when the feed fails online', async () => {
    jest.spyOn(backend, 'feed').mockRejectedValue(new Error('500'));
    jest.spyOn(backend, 'rulesAccepted').mockResolvedValue(true);
    await open('/feed');
    expect(await screen.findByTestId('feed-error')).toHaveTextContent(/Couldn’t load the feed/);
    expect(screen.getByTestId('feed-error-retry')).toBeTruthy();
  });
  it('shows the offline banner instead of an error when signal drops', async () => {
    jest.spyOn(backend, 'rulesAccepted').mockResolvedValue(true);
    await open('/feed');
    offline();
    expect(await screen.findByTestId('feed-offline')).toHaveTextContent(/No signal · /);
    expect(screen.queryByTestId('feed-error')).toBeNull();
  });
});

describe('empty states', () => {
  it('Groups: no crews yet', async () => {
    jest.spyOn(backend, 'groups').mockResolvedValue([]);
    await open('/groups');
    expect(await screen.findByTestId('groups-empty')).toHaveTextContent(/No crews yet/i);
  });
  it('Hunt log: no hunts logged yet', async () => {
    await open('/profile/hunt-log');
    expect(await screen.findByTestId('hunt-log-empty')).toHaveTextContent(/No hunts logged yet/i);
  });
  it('Life list: your list is empty', async () => {
    await open('/profile/life-list');
    expect(await screen.findByTestId('life-list-empty')).toHaveTextContent(/Your list is empty/i);
  });
});

describe('crew offline', () => {
  it('crew page: banner, invite button disabled', async () => {
    await open('/crew/invite');
    await fireEvent.changeText(await screen.findByLabelText('Crew name'), 'Tuesday Dogs');
    await fireEvent.press(screen.getByText('Start crew'));
    expect(await screen.findByText('Invite people')).toBeTruthy();
    offline();
    expect(await screen.findByTestId('crew-offline')).toHaveTextContent(/invites and shared plans wait/);
    expect(screen.getByText('Invites need signal')).toBeTruthy();
  });
  it('invite screen: banner and start/join disabled', async () => {
    await open('/crew/invite');
    await screen.findByLabelText('Crew name');
    offline();
    expect(await screen.findByTestId('invite-offline')).toHaveTextContent(/No signal · /);
    await fireEvent.changeText(screen.getByLabelText('Crew name'), 'X');
    await fireEvent.press(screen.getByText('Start crew'));
    await waitFor(() => expect(screen.queryByText('Invite people')).toBeNull());
  });
});
