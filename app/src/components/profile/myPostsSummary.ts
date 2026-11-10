import { postVisibility } from '@/data/visibility';
import type { Post } from '@/data/types';

/** Profile › My posts row subtitle. */
export function myPostsSummary(posts: Post[] | null | undefined, signedIn: boolean): string {
  if (!signedIn) return 'Sign in to see your posts';
  if (!posts) return 'Posts you share land here';
  const n = posts.length;
  if (!n) return 'Posts you share land here';
  const pending = posts.filter((p) => postVisibility(p) === 'delayed').length;
  const noun = n === 1 ? 'post' : 'posts';
  if (!pending) return `${n} ${noun}`;
  return pending === 1 ? `${n} ${noun} · 1 goes live later` : `${n} ${noun} · ${pending} go live later`;
}

export function isPending(post: Post, now = new Date()): boolean {
  return postVisibility(post, now) === 'delayed';
}

