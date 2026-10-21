import { readJson, writeJson } from '@/lib/localStore';

import { postKind, sumCounts } from './backend';
import type { Author, Post, PostDraft } from './types';

/**
 * Private hunt log entries. They stay on this device and are never uploaded,
 * so nobody else (including BirdBrain) can see the spot or the counts.
 */
const KEY = 'birdbrain.journal.v1';

export async function journalEntries(): Promise<Post[]> {
  return readJson<Post[]>(KEY, []);
}

export async function addJournalEntry(draft: PostDraft, me: Author): Promise<Post> {
  const entry: Post = {
    id: `journal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    author: me,
    mine: true,
    kind: postKind(draft),
    species: draft.species,
    caption: draft.caption,
    createdAt: new Date().toISOString(),
    publicAfter: null,
    huntedOn: draft.huntedOn,
    location: 'hidden',
    area: null,
    counts: sumCounts(draft.counts),
    placeCounts: draft.counts,
    likes: 0,
    comments: 0,
    likedByMe: false,
    group: null,
  };
  await writeJson(KEY, [entry, ...(await journalEntries())]);
  return entry;
}

export async function removeJournalEntry(id: string) {
  await writeJson(
    KEY,
    (await journalEntries()).filter((e) => e.id !== id),
  );
}
