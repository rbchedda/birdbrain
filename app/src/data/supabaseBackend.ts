import type { Session as AuthSession, SupabaseClient } from '@supabase/supabase-js';

import { parseGeometry, parsePoint, toEwkt } from '@/lib/geo';

import { NotSignedInError, postKind, type Backend, type Session } from './backend';
import placeDetailQuery from './placeDetailQuery.json';
import type { Author, BirdCounts, Comment, Place, PlaceType, Post, Profile, Species, StockingEvent } from './types';

// posts -> profiles is ambiguous to PostgREST (likes, saves and comments join
// them too), so embeds name the foreign key column.
const POST_COLUMNS = [
  'id, author_id, kind, species, caption, created_at, public_after, hunted_on',
  'location_visibility, blurred_geom, counts',
  'author:profiles!author_id(id, username, display_name)',
  'group:groups(name)',
  'likes(count)',
  'comments(count)',
].join(', ');

type Row = Record<string, any>;

const toAuthor = (r: Row | null | undefined, fallbackId: string): Author => ({
  id: r?.id ?? fallbackId,
  username: r?.username ?? null,
  displayName: r?.display_name ?? null,
});

const toSession = (s: AuthSession | null): Session | null =>
  s ? { userId: s.user.id, email: s.user.email ?? null, anonymous: Boolean(s.user.is_anonymous) } : null;

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

function checkAuth(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
}

function toCounts(v: unknown): BirdCounts | null {
  const c = v as Partial<BirdCounts> | null;
  if (!c || c.flushed === undefined) return null;
  return { flushed: Number(c.flushed) || 0, roosters: Number(c.roosters) || 0, harvested: Number(c.harvested) || 0 };
}

export function createSupabaseBackend(sb: SupabaseClient): Backend {
  let blocked = new Set<string>();

  async function me() {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new NotSignedInError();
    return id;
  }

  async function refreshBlocks(userId: string) {
    const rows = check(await sb.from('user_blocks').select('blocked_id').eq('blocker_id', userId));
    blocked = new Set((rows ?? []).map((r: Row) => r.blocked_id));
  }

  async function decorate(rows: Row[], userId: string): Promise<Post[]> {
    const ids = rows.map((r) => r.id);
    const liked = ids.length
      ? new Set(
          (check(await sb.from('likes').select('post_id').eq('user_id', userId).in('post_id', ids)) ?? []).map(
            (r: Row) => r.post_id,
          ),
        )
      : new Set<string>();
    return rows
      .filter((r) => !blocked.has(r.author_id))
      .map((r) => ({
        id: r.id,
        author: toAuthor(r.author, r.author_id),
        mine: r.author_id === userId,
        kind: r.kind,
        species: r.species,
        caption: r.caption ?? '',
        createdAt: r.created_at,
        publicAfter: r.public_after,
        huntedOn: r.hunted_on,
        location: r.location_visibility,
        area: parsePoint(r.blurred_geom),
        counts: toCounts(r.counts),
        likes: r.likes?.[0]?.count ?? 0,
        comments: r.comments?.[0]?.count ?? 0,
        likedByMe: liked.has(r.id),
        group: r.group?.name ?? null,
      }));
  }

  async function placeCounts(postId: string) {
    const rows = check(
      await sb.from('post_place_counts').select('place_id, flushed, roosters, harvested, place:places(name)').eq('post_id', postId),
    );
    return (rows ?? []).map((r: Row) => ({
      placeId: r.place_id,
      placeName: r.place?.name ?? 'Unlisted spot',
      flushed: r.flushed,
      roosters: r.roosters,
      harvested: r.harvested,
    }));
  }

  const api: Backend = {
    mode: 'supabase',

    getSession: async () => toSession((await sb.auth.getSession()).data.session),
    onSessionChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, s) => cb(toSession(s)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      checkAuth(await sb.auth.signInWithPassword({ email, password }));
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      checkAuth({ error });
      return { needsConfirmation: !data.session };
    },
    async signInAsGuest() {
      checkAuth(await sb.auth.signInAnonymously());
    },
    async signOut() {
      checkAuth(await sb.auth.signOut());
      blocked = new Set();
    },
    async deleteAccount() {
      const userId = await me();
      // Hosted Storage may refuse SQL deletes, so remove photos via the API first.
      const bucket = sb.storage.from('post-photos');
      const { data: files } = await bucket.list(userId, { limit: 1000 });
      if (files?.length) await bucket.remove(files.map((f) => `${userId}/${f.name}`));
      check(await sb.rpc('delete_my_account'));
      await sb.auth.signOut({ scope: 'local' });
      blocked = new Set();
    },

    async listPlaces() {
      const page = 1000;
      const out: Place[] = [];
      for (let from = 0; ; from += page) {
        const rows = check(
          await sb
            .from('places')
            .select('id, type, name, county, species, centroid, acres')
            .order('name')
            .range(from, from + page - 1),
        );
        for (const r of (rows ?? []) as Row[]) {
          const center = parsePoint(r.centroid);
          if (!center) continue;
          out.push({
            id: r.id,
            name: r.name,
            type: r.type as PlaceType,
            county: r.county,
            species: (r.species ?? []) as Species[],
            center,
            acres: r.acres === null ? null : Number(r.acres),
          });
        }
        if (!rows || rows.length < page) return out;
      }
    },

    async placeDetail(id) {
      // Query shape lives in placeDetailQuery.json so supabase/tests can run it against the migrations.
      const { place: pq, stocking: sq } = placeDetailQuery;
      const place = check(await sb.from(pq.table).select(pq.columns.join(', ')).eq(pq.key, id).maybeSingle()) as Row | null;
      let stocking: StockingEvent[] = [];
      // stocking_events is per county (PGC publishes county allocations), so match on the place's county.
      if (place?.type === 'stocking' && place.county) {
        const events = await sb.from(sq.table).select(sq.columns.join(', ')).eq(sq.filter, place.county).order(sq.order);
        // A stocking read failure must not cost the outline.
        stocking = ((events.error ? [] : events.data) as Row[])
          .filter((r) => r.cocks + r.hens > 0)
          .map((r) => ({
            id: r.id,
            placeId: id,
            windowStart: r.window_start,
            windowEnd: r.window_end,
            counts: { roosters: r.cocks, hens: r.hens },
          }));
      }
      return { stocking, outline: parseGeometry(place?.geom) };
    },

    async savedPlaceIds() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return [];
      return (check(await sb.from('saved_places').select('place_id')) ?? []).map((r: Row) => r.place_id);
    },

    async setPlaceSaved(id, saved) {
      const userId = await me();
      if (saved) check(await sb.from('saved_places').upsert({ user_id: userId, place_id: id }, { ignoreDuplicates: true }));
      else check(await sb.from('saved_places').delete().eq('user_id', userId).eq('place_id', id));
    },

    async feed(cursor, limit) {
      const userId = await me();
      if (!cursor) await refreshBlocks(userId);
      // RLS already hides posts before public_after and across blocks.
      let q = sb.from('posts').select(POST_COLUMNS).order('created_at', { ascending: false }).limit(limit + 1);
      if (cursor) q = q.lt('created_at', cursor);
      const rows = (check(await q) ?? []) as Row[];
      const page = rows.slice(0, limit);
      return {
        posts: await decorate(page, userId),
        next: rows.length > limit ? page[page.length - 1].created_at : null,
      };
    },

    async post(id) {
      const userId = await me();
      const row = check(await sb.from('posts').select(POST_COLUMNS).eq('id', id).maybeSingle()) as Row | null;
      if (!row) return null;
      const [post] = await decorate([row], userId);
      if (post?.mine) post.placeCounts = await placeCounts(id);
      return post ?? null;
    },

    async postsBy(authorId) {
      const userId = await me();
      const rows = check(
        await sb.from('posts').select(POST_COLUMNS).eq('author_id', authorId).order('created_at', { ascending: false }).limit(50),
      );
      return decorate((rows ?? []) as Row[], userId);
    },

    async createPost(draft) {
      const userId = await me();
      const group = draft.groupSlug
        ? (check(await sb.from('groups').select('id').eq('slug', draft.groupSlug).maybeSingle()) as Row | null)
        : null;
      const row = check(
        await sb
          .from('posts')
          .insert({
            author_id: userId,
            kind: postKind(draft),
            species: draft.species,
            caption: draft.caption || null,
            group_id: group?.id ?? null,
            location_visibility: draft.location,
            hunted_on: draft.huntedOn,
          })
          .select('id')
          .single(),
      ) as Row;
      try {
        // Exact point is owner-only; the trigger publishes the blurred grid cell.
        if (draft.exact) {
          check(await sb.from('post_locations').insert({ post_id: row.id, geom: toEwkt(draft.exact) }));
        }
        const counts = draft.counts.map((c) => ({
          post_id: row.id,
          place_id: c.placeId,
          flushed: c.flushed,
          roosters: c.roosters,
          harvested: c.harvested,
        }));
        if (counts.length) check(await sb.from('post_place_counts').insert(counts));
      } catch (e) {
        await sb.from('posts').delete().eq('id', row.id);
        throw e;
      }
      const post = await api.post(row.id);
      if (!post) throw new Error('Posted, but could not load it back.');
      return post;
    },

    async deletePost(id) {
      check(await sb.from('posts').delete().eq('id', id));
    },

    async setLiked(postId, liked) {
      const userId = await me();
      if (liked) check(await sb.from('likes').upsert({ post_id: postId, user_id: userId }, { ignoreDuplicates: true }));
      else check(await sb.from('likes').delete().eq('post_id', postId).eq('user_id', userId));
    },

    async comments(postId) {
      const userId = await me();
      const rows = check(
        await sb
          .from('comments')
          .select('id, post_id, author_id, body, created_at, author:profiles!author_id(id, username, display_name)')
          .eq('post_id', postId)
          .order('created_at'),
      );
      return ((rows ?? []) as Row[])
        .filter((r) => !blocked.has(r.author_id))
        .map(
          (r): Comment => ({
            id: r.id,
            postId: r.post_id,
            author: toAuthor(r.author, r.author_id),
            body: r.body,
            createdAt: r.created_at,
            mine: r.author_id === userId,
          }),
        );
    },

    async addComment(postId, body) {
      const userId = await me();
      const r = check(
        await sb
          .from('comments')
          .insert({ post_id: postId, author_id: userId, body })
          .select('id, post_id, author_id, body, created_at, author:profiles!author_id(id, username, display_name)')
          .single(),
      ) as Row;
      return { id: r.id, postId: r.post_id, author: toAuthor(r.author, userId), body: r.body, createdAt: r.created_at, mine: true };
    },

    async profile(id) {
      const r = check(await sb.from('profiles').select('id, username, display_name, has_dog').eq('id', id).maybeSingle()) as Row | null;
      return r ? { id: r.id, username: r.username, displayName: r.display_name, hasDog: r.has_dog } : null;
    },

    async updateProfile(patch) {
      const userId = await me();
      const update: Row = {};
      if (patch.username !== undefined) update.username = patch.username || null;
      if (patch.displayName !== undefined) update.display_name = patch.displayName || null;
      if (patch.hasDog !== undefined) update.has_dog = patch.hasDog;
      const res = await sb.from('profiles').update(update).eq('id', userId).select('id, username, display_name, has_dog').single();
      if (res.error?.code === '23505') throw new Error('That username is taken.');
      if (res.error?.code === '23514') throw new Error('Usernames are 3–24 lowercase letters, numbers or underscores.');
      const r = check(res) as Row;
      return { id: r.id, username: r.username, displayName: r.display_name, hasDog: r.has_dog } satisfies Profile;
    },

    async blockedUsers() {
      const userId = await me();
      const rows = check(
        await sb.from('user_blocks').select('blocked_id, blocked:profiles!blocked_id(id, username, display_name)').eq('blocker_id', userId),
      );
      return ((rows ?? []) as Row[]).map((r) => toAuthor(r.blocked, r.blocked_id));
    },

    async setBlocked(userId, on) {
      const mine = await me();
      if (on) check(await sb.from('user_blocks').upsert({ blocker_id: mine, blocked_id: userId }, { ignoreDuplicates: true }));
      else check(await sb.from('user_blocks').delete().eq('blocker_id', mine).eq('blocked_id', userId));
      await refreshBlocks(mine);
    },

    async report(target, reason, details) {
      const userId = await me();
      const res = await sb.from('reports').insert({
        reporter_id: userId,
        [`${target.kind}_id`]: target.id,
        reason,
        details: details || null,
      });
      if (res.error?.code === '23505') throw new Error('You already reported this.');
      check(res);
    },

    async rulesAccepted() {
      const userId = await me();
      const r = check(await sb.from('profiles').select('rules_accepted_at').eq('id', userId).maybeSingle()) as Row | null;
      return !!r?.rules_accepted_at;
    },

    async acceptRules() {
      await me();
      check(await sb.rpc('accept_community_rules'));
    },

    async groups() {
      const { data } = await sb.auth.getSession();
      const userId = data.session?.user.id;
      const rows = (check(await sb.from('groups').select('id, slug, name, description, species').order('name')) ?? []) as Row[];
      const mine = userId
        ? new Set(((check(await sb.from('group_members').select('group_id').eq('user_id', userId)) ?? []) as Row[]).map((r) => r.group_id))
        : new Set();
      return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description, species: r.species, member: mine.has(r.id) }));
    },

    async setMember(groupId, member) {
      const userId = await me();
      if (member) check(await sb.from('group_members').upsert({ group_id: groupId, user_id: userId }, { ignoreDuplicates: true }));
      else check(await sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId));
    },
  };
  return api;
}
