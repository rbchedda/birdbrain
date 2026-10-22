import type {
  Author,
  Comment,
  DataSource,
  DiaryDetails,
  Group,
  Place,
  PlaceCount,
  PlaceDetail,
  Post,
  PostDraft,
  Profile,
  ReportReason,
  ReportTarget,
  Species,
} from './types';

export interface Session {
  userId: string;
  email: string | null;
}

export interface FeedPage {
  posts: Post[];
  /** created_at cursor for the next page, or null at the end. */
  next: string | null;
}

/**
 * Everything the screens need from a server. Two implementations: Supabase
 * (when EXPO_PUBLIC_SUPABASE_* is set) and an offline sample backend that
 * mimics the same privacy rules so the app runs in Expo Go with no setup.
 */
/** One private hunt log entry as uploaded to the owner-only hunt_log_entries table. */
export interface HuntLogUpload {
  clientId: string;
  /** Server version this device last synced, or null if it never has. */
  baseVersion: number | null;
  species: Species | null;
  caption: string;
  huntedOn: string | null;
  placeCounts: PlaceCount[];
  /** Rich diary fields (spec §3.2); photos carry only their storage path. null = plain entry. */
  details?: DiaryDetails | null;
}

export interface HuntLogUpsertResult {
  version: number;
  /** The server copy changed since baseVersion; nothing was written. */
  conflict: boolean;
}

export interface Backend {
  mode: 'sample' | 'supabase' | 'unconfigured';

  getSession(): Promise<Session | null>;
  onSessionChange(cb: (s: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /** Resolves needsConfirmation when the project requires email confirmation first. */
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  /** Permanently delete the signed-in account and everything it owns, then sign out. */
  deleteAccount(): Promise<void>;
  /** Log a terms acceptance to accepted_terms (owner-only; table from feat/onboarding-consent). */
  recordTermsAcceptance(a: { acceptedAt: string; appVersion: string; termsVersion: string }): Promise<void>;

  /** Places with a known access_type only; unknown land status is never shown. */
  listPlaces(): Promise<Place[]>;
  /** Per-layer dates from ingest_state for the Data sources page and place sheets. */
  dataSources(): Promise<DataSource[]>;
  placeDetail(id: string): Promise<PlaceDetail>;
  savedPlaceIds(): Promise<string[]>;
  setPlaceSaved(id: string, saved: boolean): Promise<void>;

  feed(cursor: string | null, limit: number): Promise<FeedPage>;
  post(id: string): Promise<Post | null>;
  postsBy(userId: string): Promise<Post[]>;
  /** Shared posts only; private entries never reach a backend. */
  createPost(draft: PostDraft): Promise<Post>;
  deletePost(id: string): Promise<void>;
  setLiked(postId: string, liked: boolean): Promise<void>;
  comments(postId: string): Promise<Comment[]>;
  addComment(postId: string, body: string): Promise<Comment>;

  profile(id: string): Promise<Profile | null>;
  updateProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<Profile>;
  blockedUsers(): Promise<Author[]>;
  setBlocked(userId: string, blocked: boolean): Promise<void>;
  report(target: ReportTarget, reason: ReportReason, details?: string): Promise<void>;
  /** Whether the signed-in user has accepted the community rules (once, ever). */
  rulesAccepted(): Promise<boolean>;
  acceptRules(): Promise<void>;

  groups(): Promise<Group[]>;
  setMember(groupId: string, member: boolean): Promise<void>;

  /** Idempotent upsert of a private hunt log entry by its client UUID (owner-only). */
  upsertHuntLogEntry(entry: HuntLogUpload): Promise<HuntLogUpsertResult>;
  /** Upload a private diary photo (idempotent by path); returns its storage path. */
  uploadDiaryPhoto(clientId: string, photo: { id: string; localUri: string }): Promise<string>;
  /** Delete a private hunt log entry (and its diary details and photos) by client UUID. Idempotent; owner-only. */
  deleteHuntLogEntry(clientId: string): Promise<void>;
}

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in to do that.');
  }
}

/** Same grid as public.blur_point: snap to the center of a 0.05° cell. */
export const blurPoint = ({ lng, lat }: { lng: number; lat: number }) => ({
  lng: Math.round((Math.floor(lng / 0.05) * 0.05 + 0.025) * 1e6) / 1e6,
  lat: Math.round((Math.floor(lat / 0.05) * 0.05 + 0.025) * 1e6) / 1e6,
});

export const sumCounts = (rows: { flushed: number; roosters: number; harvested: number }[]) =>
  rows.length
    ? rows.reduce(
        (t, r) => ({ flushed: t.flushed + r.flushed, roosters: t.roosters + r.roosters, harvested: t.harvested + r.harvested }),
        { flushed: 0, roosters: 0, harvested: 0 },
      )
    : null;

export const postKind = (draft: PostDraft) => (draft.counts.some((c) => c.harvested > 0) ? 'harvest' : 'hunt');
