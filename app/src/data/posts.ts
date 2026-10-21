import type { Author, Comment, Post } from './types';

/** Offline sample community, used when Supabase isn't configured. */
export const sampleMe: Author = { id: 'sample-you', username: 'you', displayName: 'You (sample)' };

export const sampleAuthors: Author[] = [
  { id: 'sample-mike', username: 'mike_r', displayName: 'Mike R.' },
  { id: 'sample-dana', username: 'dana_k', displayName: 'Dana K.' },
  { id: 'sample-luis', username: 'luis_t', displayName: 'Luis T.' },
  { id: 'sample-sam', username: 'sam_w', displayName: 'Sam W.' },
];

const hoursAgo = (h: number, now: number) => new Date(now - h * 3600_000).toISOString();

type SamplePost = Omit<Post, 'createdAt' | 'publicAfter' | 'mine' | 'likedByMe'> & { ageHours: number };

const seed: SamplePost[] = [
  {
    id: 'p1',
    author: sampleAuthors[0],
    kind: 'harvest',
    species: 'pheasant',
    ageHours: 26,
    caption: 'First rooster of the season. The setter locked up hard on the edge of the switchgrass.',
    huntedOn: null,
    location: 'blurred',
    area: { lng: -76.225, lat: 40.125 },
    counts: { flushed: 5, roosters: 3, harvested: 1 },
    photoTint: '#5A3A22',
    likes: 24,
    comments: 2,
    group: 'PA Pheasant',
  },
  {
    id: 'p2',
    author: sampleAuthors[1],
    kind: 'hunt',
    species: 'grouse',
    ageHours: 30,
    caption: 'Didn’t fire a shot, but flushed four birds in an old clearcut. Worth the hike.',
    huntedOn: null,
    location: 'blurred',
    area: { lng: -77.925, lat: 40.875 },
    counts: { flushed: 4, roosters: 0, harvested: 0 },
    photoTint: '#2F4A33',
    likes: 41,
    comments: 1,
    group: 'PA Grouse',
  },
  {
    id: 'p3',
    author: sampleAuthors[2],
    kind: 'harvest',
    species: 'dove',
    ageHours: 52,
    caption: 'Opening afternoon on a managed field. Bring more shells than you think.',
    huntedOn: null,
    location: 'blurred',
    area: { lng: -76.825, lat: 39.925 },
    counts: null,
    photoTint: '#6B5A2E',
    likes: 18,
    comments: 0,
    group: null,
  },
  {
    id: 'p4',
    author: sampleAuthors[3],
    kind: 'hunt',
    species: 'waterfowl',
    ageHours: 75,
    caption: 'Fog lifted at 7:40 and the woodies came in low. New hunters: get your duck stamp early.',
    huntedOn: null,
    location: 'hidden',
    area: null,
    counts: null,
    photoTint: '#23404A',
    likes: 33,
    comments: 0,
    group: 'PA Waterfowl',
  },
];

export function samplePosts(now = Date.now()): Post[] {
  return seed.map(({ ageHours, ...p }) => ({
    ...p,
    createdAt: hoursAgo(ageHours, now),
    // Seed posts are all past their next-day delay.
    publicAfter: hoursAgo(ageHours - 12, now),
    mine: false,
    likedByMe: false,
  }));
}

export function sampleComments(now = Date.now()): Comment[] {
  return [
    { id: 'c1', postId: 'p1', author: sampleAuthors[1], body: 'Great dog work!', createdAt: hoursAgo(20, now), mine: false },
    { id: 'c2', postId: 'p1', author: sampleAuthors[3], body: 'Nice bird. What choke?', createdAt: hoursAgo(18, now), mine: false },
    { id: 'c3', postId: 'p2', author: sampleAuthors[0], body: 'Four flushes is a good day anywhere.', createdAt: hoursAgo(25, now), mine: false },
  ];
}
