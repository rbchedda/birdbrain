import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { backend } from '@/data';
import * as crew from '@/data/crew';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});
const open = (url: string) => renderRouter('./src/app', { initialUrl: url });

afterEach(() => {
  jest.restoreAllMocks();
  crew.__resetInviteCardSession();
});
afterAll(() => AsyncStorage.clear());

describe('invite token parsing', () => {
  it('accepts links and bare tokens, rejects junk', () => {
    const t = 'a1b2c3d4e5f6a7b8c9d0';
    expect(crew.parseInviteToken(`birdbrain://crew/invite?token=${t}`)).toBe(t);
    expect(crew.parseInviteToken(`https://x.test/crew/invite?foo=1&token=${t}`)).toBe(t);
    expect(crew.parseInviteToken(` ${t} `)).toBe(t);
    expect(crew.parseInviteToken('hello')).toBeNull();
    expect(crew.parseInviteToken('')).toBeNull();
  });
});

describe('crews (sample backend)', () => {
  it('crewSize is 0 with no crews', async () => {
    expect(await crew.crewSize()).toBe(0);
  });

  it('starts a crew from the Feed empty state and lands on its page as admin', async () => {
    await open('/feed?tab=crew');
    await fireEvent.press(await screen.findByText('Start or join a crew'));
    await fireEvent.changeText(await screen.findByLabelText('Crew name'), 'Tuesday Dogs');
    await fireEvent.press(screen.getByText('Start crew'));
    expect(await screen.findByText('Tuesday Dogs')).toBeTruthy();
    expect(await screen.findByText('Admin')).toBeTruthy();
    expect(screen.getByText('Invite people')).toBeTruthy();
    expect(await crew.crewSize()).toBe(1);
  });

  it.each([['blank', '   '], ['too long', 'x'.repeat(41)]])('rejects %s names', async (_label, name) => {
    await open('/crew/invite');
    await fireEvent.changeText(await screen.findByLabelText('Crew name'), name);
    await fireEvent.press(screen.getByText('Start crew'));
    expect(await screen.findByText('Crew names are 1 to 40 characters.')).toBeTruthy();
  });

  it('Feed defaults to Crew and lists the crew once the user has one', async () => {
    await open('/feed');
    expect(await screen.findByRole('tab', { name: 'My crew', selected: true })).toBeTruthy();
    expect(await screen.findByTestId('crew-list')).toBeTruthy();
    expect(screen.getByLabelText('Open crew Tuesday Dogs')).toBeTruthy();
    expect(screen.queryByTestId('invite-card')).toBeNull();
  });

  it('admins get an invite link with a QR code', async () => {
    const [c] = await backend.myCrews();
    await open(`/crew/invite?id=${c.id}`);
    expect(await screen.findByTestId('crew-invite-qr')).toBeTruthy();
    expect(screen.getByText('Share invite link')).toBeTruthy();
  });

  it('joining with an invalid link shows a friendly error', async () => {
    await open('/crew/invite');
    await fireEvent.changeText(await screen.findByLabelText('Invite link'), 'birdbrain://crew/invite?token=deadbeefdeadbeefdead');
    await fireEvent.press(screen.getByText('Join crew'));
    expect(await screen.findByText(/invalid or has expired/)).toBeTruthy();
  });

  it('opening an invite link joins the crew (no-op if already a member)', async () => {
    const [c] = await backend.myCrews();
    const { token } = await backend.createCrewInvite(c.id);
    await open(`/crew/invite?token=${token}`);
    await fireEvent.press(await screen.findByText('Join crew'));
    expect(await screen.findByTestId('crew-members')).toBeTruthy();
    expect((await backend.crew(c.id))?.memberCount).toBe(1);
  });

  it('leaving removes the crew and returns to the Feed', async () => {
    const [c] = await backend.myCrews();
    await open(`/crew/${c.id}`);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await fireEvent.press(await screen.findByText('Leave crew'));
    expect(alert).toHaveBeenCalled();
    expect(await screen.findByRole('tab', { name: 'Community', selected: true })).toBeTruthy();
    expect(await crew.crewSize()).toBe(0);
    expect(await backend.crew(c.id)).toBeNull();
  });

  it("a non-member sees nothing on the crew page", async () => {
    await open('/crew/not-a-real-crew');
    expect(await screen.findByText('This crew doesn’t exist, or you’re not a member.')).toBeTruthy();
  });
});

describe('crew rules (follow-up)', () => {
  const { leaveSampleCrew, CREW_MEMBER_CAP, CREW_INVITE_CAP } = jest.requireActual('@/data/sampleBackend');
  const { crewError } = jest.requireActual('@/data/backend');
  const { leaveWarning } = jest.requireActual('@/app/crew/[id]');
  const m = (id: string, role: 'admin' | 'member' = 'member') => ({ author: { id }, role });

  it('leaving as last admin promotes the longest-standing member; last member deletes', () => {
    const c = { members: [m('me', 'admin'), m('old'), m('new')] };
    expect(leaveSampleCrew(c, 'me')).toBe('promoted');
    expect(c.members).toEqual([m('old', 'admin'), m('new')]);
    expect(leaveSampleCrew(c, 'new')).toBe('left');
    expect(leaveSampleCrew(c, 'old')).toBe('deleted');
    expect(leaveSampleCrew({ members: [m('a', 'admin'), m('me', 'admin')] }, 'me')).toBe('left');
  });

  it('warns about promotion or deletion before leaving', () => {
    expect(leaveWarning(true, 3)).toMatch(/longest-standing member becomes admin/);
    expect(leaveWarning(true, 1)).toMatch(/deletes this crew/);
    expect(leaveWarning(false, 3)).toBe('You’ll need a new invite to rejoin.');
  });

  it('maps server errors to plain language', () => {
    expect(crewError('crew is full')).toMatch(/25 members/);
    expect(crewError('too many active invites')).toMatch(/10 active invites/);
    expect(crewError('create an account to join a crew')).toMatch(/Create an account/);
    expect(crewError('boom')).toBe('boom');
    expect([CREW_MEMBER_CAP, CREW_INVITE_CAP]).toEqual([25, 10]);
  });

  it('the sample backend caps active invites at 10 and deletes a crew when its last member leaves', async () => {
    const id = await backend.createCrew('Cap Test');
    for (let i = 0; i < 10; i++) await backend.createCrewInvite(id);
    await expect(backend.createCrewInvite(id)).rejects.toThrow(/10 active invites/);
    expect(await backend.leaveCrew(id)).toBe('deleted');
    expect(await backend.crew(id)).toBeNull();
  });

});
