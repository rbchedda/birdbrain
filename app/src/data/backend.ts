import type {
  Crew,
  CrewDetail,
  CrewInvite,
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

/** Plain-language versions of the crew RPCs' errors. */
export function crewError(message: string): string {
  if (/crew is full/.test(message)) return 'This crew is full (25 members max).';
  if (/too many active invites/.test(message)) return 'This crew already has 10 active invites. Wait for one to expire (invites last 7 days).';
  if (/create an account/.test(message)) return 'Create an account to start or join a crew.';
  if (/invalid or expired/.test(message)) return 'That invite is invalid or has expired.';
  return message;
}

export type LeaveCrewResult = 'left' | 'promoted' | 'deleted';

export interface Session {
  userId: string;
  email: string | null;
  /** Never true from our backends (anonymous sessions map to signed out); kept for #25's defensive checks. */
  anonymous?: boolean;
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

/** One onboarding acceptance (liability memo §4C), as logged to accepted_terms. */
export interface TermsAcceptance {
  acceptedAt: string;
  appVersion: string;
  termsVersion: string;
  /** Option A (flag on): the map notice version consented to, and the platform. */
  noticeVersion?: string;
  platform?: string;
}

/** One map-notice dismissal, as logged to notice_acknowledgements (kind 'notice_dismiss'). */
export interface NoticeDismissal {
  noticeVersion: string;
  appVersion: string;
  /** How it was dismissed (spec Option A): the banner close button or "Got it". */
  method?: 'close' | 'got_it' | 'show_on_map';
  /** Defaults to 'notice_dismiss'. 'notice_restore' = "Show on map". */
  kind?: 'notice_dismiss' | 'notice_restore';
  platform?: string;
  /** Device time of the tap (ISO); the event may be sent later from the offline queue. */
  at?: string;
  /** Offline-queue id; a replay is a no-op on the server. */
  clientId?: string;
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
  /** Finish an email-link sign-in (PKCE code, or access/refresh tokens). Throws if the link is bad or expired. */
  completeAuthRedirect(p: { code?: string; accessToken?: string; refreshToken?: string }): Promise<void>;
  signOut(): Promise<void>;
  /** Permanently delete the signed-in account and everything it owns, then sign out. */
  deleteAccount(): Promise<void>;

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
  /** Log a ToS/onboarding acceptance to accepted_terms (owner-only). Re-sending the same terms version is a no-op. */
  recordTermsAcceptance(a: TermsAcceptance): Promise<void>;
  /** Log a deliberate map-notice dismissal for the signed-in account (notice_acknowledgements). */
  recordNoticeDismissal(a: NoticeDismissal): Promise<void>;
  /** The signed-in account's latest notice action for this version, or null if none. Throws offline. */
  latestNoticeAction(noticeVersion: string): Promise<'notice_dismiss' | 'notice_restore' | null>;

  groups(): Promise<Group[]>;
  setMember(groupId: string, member: boolean): Promise<void>;

  /** Private crews the signed-in user belongs to (empty when signed out). */
  myCrews(): Promise<Crew[]>;
  /** A crew with its members; null when it doesn't exist or the user isn't a member (RLS). */
  crew(id: string): Promise<CrewDetail | null>;
  /** Create a crew; the caller becomes its admin. Returns the crew id. */
  createCrew(name: string): Promise<string>;
  /** New invite token for a crew the caller administers. */
  createCrewInvite(crewId: string): Promise<CrewInvite>;
  /** Join a crew by invite token (always as a member). Returns the crew id. */
  joinCrew(token: string): Promise<string>;
  /** 'promoted': you were the last admin and the longest-standing member took over; 'deleted': you were the last member. */
  leaveCrew(crewId: string): Promise<LeaveCrewResult>;

  /** Idempotent upsert of a private hunt log entry by its client UUID (owner-only). */
  upsertHuntLogEntry(entry: HuntLogUpload): Promise<HuntLogUpsertResult>;
  /** Upload a private diary photo (idempotent by path); returns its storage path. */
  uploadDiaryPhoto(clientId: string, photo: { id: string; localUri: string }): Promise<string>;
  /** Delete a private hunt log entry (and its diary details and photos) by client UUID. Idempotent; owner-only. */
  deleteHuntLogEntry(clientId: string): Promise<void>;

  /**
   * Idempotent push of a hunt plan to public.plans (hosted-changes-needed.md §2-3):
   * insert-or-ignore on (user_id, client_id), then update the editable columns.
   * shared=false when crewId was asked for but the server refused it (e.g. §3 not applied).
   */
  upsertPlan(plan: PlanUpload): Promise<{ shared: boolean }>;
  /** Delete a hunt plan by client UUID. Idempotent; owner-only. */
  deletePlan(clientId: string): Promise<void>;
  /** The signed-in user's own plans plus plans shared to their crews (RLS decides; §2-3). */
  listServerPlans(): Promise<ServerPlan[]>;
}

export interface ServerPlan extends PlanUpload {
  userId: string;
  crewName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PlanReminder = 'none' | 'night_before_8pm' | 'hour_before_legal';
export interface PlanUpload {
  clientId: string;
  placeId: string;
  placeName: string;
  planDate: string;
  species: string[];
  notes: string;
  reminder: PlanReminder;
  crewId: string | null;
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
