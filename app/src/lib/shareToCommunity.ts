import { useSyncExternalStore } from 'react';

import { readShareToCommunity, writeShareToCommunity } from './localStore';

// One in-memory copy of the "Share to community" opt-in, shared by every screen
// so Diary, Crew and Profile agree right after it changes.
let value = false;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  loaded ??= readShareToCommunity().then((v) => {
    value = v === true;
    emit();
  });
  return loaded;
}

export async function setShareToCommunity(on: boolean) {
  value = on;
  emit();
  await writeShareToCommunity(on);
}

/** For tests: forget the cached value so the next read comes from storage. */
export function resetShareToCommunityCache() {
  value = false;
  loaded = null;
}

/** Whether the user opted in to the community feed. Off until they choose it. */
export function useShareToCommunity() {
  load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => value,
  );
}
