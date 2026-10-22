import { router } from 'expo-router';
import { useCallback } from 'react';

export interface PromptSignInContext {
  /** Why we're asking, e.g. 'first-hunt-save'. */
  reason: 'first-hunt-save';
  /** Human label of what is being kept, e.g. "SGL 211 · Pheasant". */
  entryLabel: string;
}

/**
 * PLACEHOLDER. TODO(feat/guest-mode-hybrid): dev-3 owns the real sign-in sheet
 * (hybrid accounts, sign-in on first save). Replace this hook with theirs when
 * that branch lands; do not build a second sheet here. Until then it just opens
 * the existing /sign-in screen. The entry is already saved on the phone.
 */
export function usePromptSignIn() {
  return useCallback((_ctx: PromptSignInContext) => {
    router.push('/sign-in');
  }, []);
}
