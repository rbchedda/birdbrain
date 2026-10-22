import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';

import { readJson, writeJson } from '@/lib/localStore';

import { backend } from '@/data';
import type { Crew } from '@/data/types';

/**
 * Number of crews the user belongs to (0 when signed out, offline or unconfigured).
 * Supabase: real membership via RLS. Sample/mock mode: device-local crews.
 */
export async function crewSize(): Promise<number> {
  try {
    if (!(await backend.getSession())) return 0;
    return (await backend.myCrews()).length;
  } catch {
    return 0;
  }
}

/** null while loading. */
export function useCrewSize(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    crewSize().then((v) => live && setN(v), () => live && setN(0));
    return () => {
      live = false;
    };
  }, []);
  return n;
}

export const INVITE_CARD_DISMISSED_KEY = 'birdbrain.feed.inviteCardDismissed.v1';
// Session fallback, so dismissal sticks even if storage is unavailable.
let dismissedThisSession = false;
export const __resetInviteCardSession = () => {
  dismissedThisSession = false;
};

/** The slim "Invite your crew" card's dismissal: kept for the session and persisted on the device. */
export function useInviteCardDismissed(): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(dismissedThisSession);
  useEffect(() => {
    if (dismissedThisSession) return;
    readJson<boolean>(INVITE_CARD_DISMISSED_KEY, false).then((v) => v && setDismissed(true));
  }, []);
  const dismiss = useCallback(() => {
    dismissedThisSession = true;
    setDismissed(true);
    void writeJson(INVITE_CARD_DISMISSED_KEY, true);
  }, []);
  return [dismissed, dismiss];
}

/** The user's crews; null while loading. Reloads on demand (e.g. on screen focus). */
export function useMyCrews(): { crews: Crew[] | null; error: string | null; reload: () => void } {
  const [crews, setCrews] = useState<Crew[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = (await backend.getSession()) ? await backend.myCrews() : [];
        if (live) {
          setCrews(list);
          setError(null);
        }
      } catch (e) {
        if (live) {
          setCrews([]);
          setError((e as Error).message);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [n]);
  return { crews, error, reload: useCallback(() => setN((x) => x + 1), []) };
}

/** The link a crew invite token opens (birdbrain://crew/invite?token=… on device, https on web). */
export const inviteUrl = (token: string) => Linking.createURL('crew/invite', { queryParams: { token } });

/** Accepts a pasted invite link or a bare token. */
export function parseInviteToken(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/[?&]token=([A-Za-z0-9]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{16,128}$/.test(s) ? s : null;
}
