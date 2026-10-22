import { useCallback, useEffect, useState } from 'react';

import { readJson, writeJson } from '@/lib/localStore';

/**
 * Number of people in the user's crew.
 * TODO: crews don't exist in the backend yet, so this is always 0. Wire it to the
 * real crew membership when crews ship.
 */
export async function crewSize(): Promise<number> {
  return 0;
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
