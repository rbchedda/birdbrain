import { readJson, writeJson } from '@/lib/localStore';
import { publicAfterET } from '@/lib/time';

import { blurPoint, crewError, postKind, sumCounts, type Backend, type FeedPage, type HuntLogUpload, type LeaveCrewResult, type Session } from './backend';
import { samplePlaces, sampleStocking } from './places';
import { sampleAuthors, sampleComments, sampleMe, samplePosts } from './posts';
import { containsObjectionable, OBJECTIONABLE_MESSAGE } from './moderation';
import type { Author, Comment, Crew, CrewDetail, Group, Post, Profile } from './types';

const KEY = 'birdbrain.sample.v1';
/** Stand-in for the server's hunt_log_entries table. */
export const HUNT_LOG_KEY = 'birdbrain.sample.huntlog.v1';

export const CREW_MEMBER_CAP = 25;
export const CREW_INVITE_CAP = 10;

/**
 * Mirrors public.crew_after_member_delete. Members are kept in join order, so the
 * first remaining one is the longest-standing (the DB breaks ties by user id).
 */
export function leaveSampleCrew(c: { members: { author: { id: string }; role: 'admin' | 'member' }[] }, userId: string): LeaveCrewResult {
  const me = c.members.find((m) => m.author.id === userId);
  if (!me) return 'left';
  c.members = c.members.filter((m) => m !== me);
  if (!c.members.length) return 'deleted';
  if (!c.members.some((m) => m.role === 'admin')) {
    c.members[0].role = 'admin';
    return 'promoted';
  }
  return 'left';
}

interface SampleCrew {
  id: string;
  name: string;
  members: { author: Author; role: 'member' | 'admin' }[];
}

interface State {
  posts: Post[];
  comments: Comment[];
  likes: string[];
  blocked: string[];
  saved: string[];
  members: string[];
  crews: SampleCrew[];
  invites: { token: string; crewId: string; expiresAt: string }[];
  profile: Profile;
  reports: { target: string; reason: string }[];
  rulesAcceptedAt: string | null;
}

const sampleGroups: Omit<Group, 'member'>[] = [
  { id: 'g-pheasant', slug: 'pa-pheasant', name: 'PA Pheasant', description: 'Stocking updates, dog work and field reports.', species: 'pheasant' },
  { id: 'g-dove', slug: 'pa-dove', name: 'PA Dove', description: 'Managed fields, opening day and migratory rules.', species: 'dove' },
  { id: 'g-turkey', slug: 'pa-turkey', name: 'PA Turkey', description: 'Spring and fall turkey across the Commonwealth.', species: 'turkey' },
  { id: 'g-grouse', slug: 'pa-grouse', name: 'PA Grouse', description: 'Ruffed grouse cover, flush counts and habitat.', species: 'grouse' },
  { id: 'g-waterfowl', slug: 'pa-waterfowl', name: 'PA Waterfowl', description: 'Ducks and geese: zones, stamps and blinds.', species: 'waterfowl' },
];

const session: Session = { userId: sampleMe.id, email: null };

/**
 * Offline backend. Applies the same rules the database enforces (next-day
 * delay, blurred locations, blocks hiding both ways) so the UI behaves the
 * same with or without Supabase. Your own posts persist on this device.
 */
export function createSampleBackend(now: () => Date = () => new Date()): Backend {
  let state: State | null = null;

  async function load(): Promise<State> {
    if (state) return state;
    const saved = await readJson<Partial<State>>(KEY, {});
    state = {
      posts: [...(saved.posts ?? []), ...samplePosts(now().getTime())],
      comments: [...sampleComments(now().getTime()), ...(saved.comments ?? [])],
      likes: saved.likes ?? [],
      blocked: saved.blocked ?? [],
      saved: saved.saved ?? [],
      members: saved.members ?? [],
      crews: saved.crews ?? [],
      invites: saved.invites ?? [],
      profile: saved.profile ?? { id: sampleMe.id, username: sampleMe.username, displayName: sampleMe.displayName, hasDog: false },
      reports: saved.reports ?? [],
      rulesAcceptedAt: saved.rulesAcceptedAt ?? null,
    };
    return state;
  }

  // Persist only what the user created; seed data is rebuilt each launch.
  const persist = (s: State) =>
    writeJson(KEY, {
      posts: s.posts.filter((p) => p.mine),
      comments: s.comments.filter((c) => c.mine),
      likes: s.likes,
      blocked: s.blocked,
      saved: s.saved,
      members: s.members,
      crews: s.crews,
      invites: s.invites,
      profile: s.profile,
      reports: s.reports,
      rulesAcceptedAt: s.rulesAcceptedAt,
    });

  const me = (s: State): Author => ({ id: sampleMe.id, username: s.profile.username, displayName: s.profile.displayName });

  const visible = (s: State, p: Post) =>
    p.mine || (!!p.publicAfter && new Date(p.publicAfter) <= now() && !s.blocked.includes(p.author.id));

  const decorate = (s: State, p: Post): Post => ({
    ...p,
    author: p.mine ? me(s) : p.author,
    likedByMe: s.likes.includes(p.id),
    likes: p.likes + (s.likes.includes(p.id) ? 1 : 0),
    comments: s.comments.filter((c) => c.postId === p.id && !s.blocked.includes(c.author.id)).length,
    // Others never see the per-place breakdown.
    placeCounts: p.mine ? p.placeCounts : undefined,
  });

  return {
    mode: 'sample',

    getSession: async () => session,
    onSessionChange: () => () => {},
    signIn: async () => {},
    signUp: async () => ({ needsConfirmation: false }),
    completeAuthRedirect: async () => {},
    signOut: async () => {},
    async deleteAccount() {
      // Drop everything this device stored for the sample user and rebuild from seed data.
      state = null;
      await writeJson(KEY, {});
    },

    listPlaces: async () => samplePlaces,
    // Sample data has no ingest: the Data sources page shows dates as unknown.
    dataSources: async () => [],
    placeDetail: async (id) => ({ stocking: sampleStocking.filter((e) => e.placeId === id), outline: null }),
    savedPlaceIds: async () => (await load()).saved,
    async setPlaceSaved(id, on) {
      const s = await load();
      s.saved = on ? [...new Set([...s.saved, id])] : s.saved.filter((x) => x !== id);
      await persist(s);
    },

    async feed(cursor, limit): Promise<FeedPage> {
      const s = await load();
      const all = s.posts
        .filter((p) => visible(s, p))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .filter((p) => !cursor || p.createdAt < cursor);
      const posts = all.slice(0, limit).map((p) => decorate(s, p));
      return { posts, next: all.length > limit ? posts[posts.length - 1].createdAt : null };
    },

    async post(id) {
      const s = await load();
      const p = s.posts.find((x) => x.id === id);
      return p && visible(s, p) ? decorate(s, p) : null;
    },

    async postsBy(userId) {
      const s = await load();
      return s.posts
        .filter((p) => p.author.id === userId && visible(s, p))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((p) => decorate(s, p));
    },

    async createPost(draft) {
      const s = await load();
      if (containsObjectionable(draft.caption)) throw new Error(OBJECTIONABLE_MESSAGE);
      const created = now();
      const post: Post = {
        id: `local-${created.getTime().toString(36)}`,
        author: me(s),
        mine: true,
        kind: postKind(draft),
        species: draft.species,
        caption: draft.caption,
        createdAt: created.toISOString(),
        publicAfter: publicAfterET(created).toISOString(),
        huntedOn: draft.huntedOn,
        location: draft.location,
        area: draft.location === 'blurred' && draft.exact ? blurPoint(draft.exact) : null,
        counts: sumCounts(draft.counts),
        placeCounts: draft.counts,
        likes: 0,
        comments: 0,
        likedByMe: false,
        group: sampleGroups.find((g) => g.slug === draft.groupSlug)?.name ?? null,
      };
      s.posts = [post, ...s.posts];
      await persist(s);
      return decorate(s, post);
    },

    async deletePost(id) {
      const s = await load();
      s.posts = s.posts.filter((p) => !(p.id === id && p.mine));
      await persist(s);
    },

    async setLiked(postId, liked) {
      const s = await load();
      const p = s.posts.find((x) => x.id === postId);
      if (!p || !visible(s, p)) throw new Error('Post not found.');
      s.likes = liked ? [...new Set([...s.likes, postId])] : s.likes.filter((x) => x !== postId);
      await persist(s);
    },

    async comments(postId) {
      const s = await load();
      const p = s.posts.find((x) => x.id === postId);
      if (!p || !visible(s, p)) return [];
      return s.comments
        .filter((c) => c.postId === postId && !s.blocked.includes(c.author.id))
        .map((c) => (c.mine ? { ...c, author: me(s) } : c));
    },

    async addComment(postId, body) {
      const s = await load();
      if (containsObjectionable(body)) throw new Error(OBJECTIONABLE_MESSAGE);
      const p = s.posts.find((x) => x.id === postId);
      // Same rule as the database: no comments until the post is visible to you.
      if (!p || !visible(s, p)) throw new Error('You can comment once this post is public.');
      const c: Comment = { id: `lc-${Date.now().toString(36)}`, postId, author: me(s), body, createdAt: now().toISOString(), mine: true };
      s.comments = [...s.comments, c];
      await persist(s);
      return c;
    },

    async profile(id) {
      const s = await load();
      if (id === sampleMe.id) return s.profile;
      const a = sampleAuthors.find((x) => x.id === id);
      return a && !s.blocked.includes(id) ? { id, username: a.username, displayName: a.displayName, hasDog: false } : null;
    },

    async updateProfile(patch) {
      const s = await load();
      if (patch.username !== undefined && patch.username !== null && !/^[a-z0-9_]{3,24}$/.test(patch.username)) {
        throw new Error('Usernames are 3–24 lowercase letters, numbers or underscores.');
      }
      s.profile = { ...s.profile, ...patch };
      await persist(s);
      return s.profile;
    },

    async blockedUsers() {
      const s = await load();
      return sampleAuthors.filter((a) => s.blocked.includes(a.id));
    },

    async setBlocked(userId, blocked) {
      const s = await load();
      if (userId === sampleMe.id) throw new Error('You can’t block yourself.');
      s.blocked = blocked ? [...new Set([...s.blocked, userId])] : s.blocked.filter((x) => x !== userId);
      await persist(s);
    },

    async report(target, reason) {
      const s = await load();
      const key = `${target.kind}:${target.id}`;
      // Same rule as the database: one open report per reporter per target.
      if (s.reports.some((r) => r.target === key)) throw new Error('You already reported this.');
      s.reports = [...s.reports, { target: key, reason }];
      await persist(s);
    },

    async rulesAccepted() {
      const s = await load();
      return !!s.rulesAcceptedAt;
    },

    async acceptRules() {
      const s = await load();
      s.rulesAcceptedAt ??= now().toISOString();
      await persist(s);
    },

    // Sample mode has no server: acceptances stay in the device-side consent record.
    async recordTermsAcceptance() {},
    async recordNoticeDismissal() {},

    async groups() {
      const s = await load();
      return sampleGroups.map((g) => ({ ...g, member: s.members.includes(g.id) }));
    },

    async setMember(groupId, member) {
      const s = await load();
      s.members = member ? [...new Set([...s.members, groupId])] : s.members.filter((x) => x !== groupId);
      await persist(s);
    },

    // Crews mirror public.create_crew / create_crew_invite / join_crew: device-local only,
    // so a sample-mode invite can only be redeemed on the same device.
    async myCrews() {
      const s = await load();
      return s.crews.flatMap((c): Crew[] => {
        const m = c.members.find((x) => x.author.id === sampleMe.id);
        return m ? [{ id: c.id, name: c.name, role: m.role, memberCount: c.members.length }] : [];
      });
    },

    async crew(id) {
      const s = await load();
      const c = s.crews.find((x) => x.id === id);
      const m = c?.members.find((x) => x.author.id === sampleMe.id);
      if (!c || !m) return null;
      return { id: c.id, name: c.name, role: m.role, memberCount: c.members.length, members: c.members } satisfies CrewDetail;
    },

    async createCrew(name) {
      const s = await load();
      const n = name.trim();
      if (n.length < 1 || n.length > 40) throw new Error('Crew names are 1 to 40 characters.');
      const id = `crew-${now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      s.crews.push({ id, name: n, members: [{ author: { id: sampleMe.id, username: s.profile.username, displayName: s.profile.displayName }, role: 'admin' }] });
      await persist(s);
      return id;
    },

    async createCrewInvite(crewId) {
      const s = await load();
      const c = s.crews.find((x) => x.id === crewId);
      if (!c?.members.some((m) => m.author.id === sampleMe.id && m.role === 'admin')) throw new Error('Only crew admins can invite.');
      const active = s.invites.filter((i) => i.crewId === crewId && new Date(i.expiresAt) > now()).length;
      if (active >= CREW_INVITE_CAP) throw new Error(crewError('too many active invites'));
      const token = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
      const expiresAt = new Date(now().getTime() + 7 * 24 * 3600e3).toISOString();
      s.invites.push({ token, crewId, expiresAt });
      await persist(s);
      return { token, expiresAt };
    },

    async joinCrew(token) {
      const s = await load();
      const inv = s.invites.find((i) => i.token === token.trim() && new Date(i.expiresAt) > now());
      const c = inv && s.crews.find((x) => x.id === inv.crewId);
      if (!c) throw new Error('That invite is invalid or has expired.');
      const already = c.members.some((m) => m.author.id === sampleMe.id);
      if (!already && c.members.length >= CREW_MEMBER_CAP) throw new Error(crewError('crew is full'));
      if (!already)
        c.members.push({ author: { id: sampleMe.id, username: s.profile.username, displayName: s.profile.displayName }, role: 'member' });
      await persist(s);
      return c.id;
    },

    async leaveCrew(crewId) {
      const s = await load();
      const c = s.crews.find((x) => x.id === crewId);
      const outcome = c ? leaveSampleCrew(c, sampleMe.id) : 'left';
      if (outcome === 'deleted') {
        s.crews = s.crews.filter((x) => x.id !== crewId);
        s.invites = s.invites.filter((i) => i.crewId !== crewId);
      }
      await persist(s);
      return outcome;
    },

    // Mirrors public.upsert_hunt_log_entry: idempotent by client id, conflict on a stale base version.
    async upsertHuntLogEntry(e) {
      const rows = await readJson<Record<string, HuntLogUpload & { version: number }>>(HUNT_LOG_KEY, {});
      const cur = rows[e.clientId];
      const body = (x: HuntLogUpload) => JSON.stringify([x.species, x.caption, x.huntedOn, x.placeCounts, x.details ?? null]);
      if (!cur) {
        rows[e.clientId] = { ...e, baseVersion: null, version: 1 };
        await writeJson(HUNT_LOG_KEY, rows);
        return { version: 1, conflict: false };
      }
      if (body(cur) === body(e)) return { version: cur.version, conflict: false };
      if (e.baseVersion !== null && e.baseVersion === cur.version) {
        rows[e.clientId] = { ...e, baseVersion: null, version: cur.version + 1 };
        await writeJson(HUNT_LOG_KEY, rows);
        return { version: cur.version + 1, conflict: false };
      }
      return { version: cur.version, conflict: true };
    },

    async deleteHuntLogEntry(clientId) {
      const rows = await readJson<Record<string, unknown>>(HUNT_LOG_KEY, {});
      delete rows[clientId];
      await writeJson(HUNT_LOG_KEY, rows);
    },

    // Offline: photos stay on the device; the path mirrors the private bucket layout.
    async uploadDiaryPhoto(clientId, photo) {
      return `${sampleMe.id}/${clientId}/${photo.id}.jpg`;
    },
  };
}
