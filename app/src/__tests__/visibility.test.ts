import { goesPublicLabel, postVisibility, visibilityText } from '@/data/visibility';
import { myPostsSummary } from '@/components/profile/myPostsSummary';
import type { Post } from '@/data/types';

describe('goesPublicLabel', () => {
  it('uses the device-local time, and omits the date when it is today', () => {
    const now = new Date('2026-11-10T15:00:00');
    const laterToday = new Date('2026-11-10T15:40:00');
    const expected = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(laterToday);
    expect(goesPublicLabel(laterToday.toISOString(), now)).toBe(`Goes public at ${expected}`);
  });

  it('includes the local date when it is not today', () => {
    const now = new Date('2026-11-10T15:00:00');
    const tomorrow = new Date('2026-11-11T15:40:00');
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(tomorrow);
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(tomorrow);
    expect(goesPublicLabel(tomorrow.toISOString(), now)).toBe(`Goes public at ${time} on ${day}`);
  });
});

describe('visibilityText', () => {
  it('uses Goes public at … for the author of a pending post', () => {
    const at = new Date('2026-11-11T15:40:00').toISOString();
    expect(visibilityText({ publicAfter: at }, new Date('2026-11-10T12:00:00'))).toMatch(/^Goes public at /);
    expect(visibilityText({ publicAfter: new Date('2026-11-09T12:00:00').toISOString() }, new Date('2026-11-10T12:00:00'))).toBe(
      'Public',
    );
  });
});

describe('myPostsSummary', () => {
  const post = (publicAfter: string | null): Post =>
    ({
      id: 'x',
      author: { id: 'me', username: null, displayName: 'You' },
      mine: true,
      kind: 'hunt',
      species: null,
      caption: '',
      createdAt: new Date().toISOString(),
      publicAfter,
      huntedOn: null,
      location: 'blurred',
      area: null,
      counts: null,
      likes: 0,
      comments: 0,
      likedByMe: false,
      group: null,
    }) as Post;

  it('describes pending vs public counts', () => {
    expect(myPostsSummary(undefined, false)).toBe('Sign in to see your posts');
    expect(myPostsSummary([], true)).toBe('Posts you share land here');
    expect(myPostsSummary([post(new Date(Date.now() - 1000).toISOString())], true)).toBe('1 post');
    expect(myPostsSummary([post(new Date(Date.now() + 3600_000).toISOString())], true)).toBe('1 post · 1 goes live later');
  });
});

describe('postVisibility', () => {
  it('treats a future publicAfter as delayed', () => {
    expect(postVisibility({ publicAfter: new Date(Date.now() + 3600_000).toISOString() })).toBe('delayed');
  });
});
