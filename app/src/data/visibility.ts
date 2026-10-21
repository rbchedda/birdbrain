import { formatDay, formatTime, etParts } from '@/lib/time';

import type { Post, Visibility } from './types';

export function postVisibility(post: Pick<Post, 'publicAfter'>, now = new Date()): Visibility {
  if (!post.publicAfter) return 'private';
  return new Date(post.publicAfter) > now ? 'delayed' : 'public';
}

export function visibilityText(post: Pick<Post, 'publicAfter'>, now = new Date()) {
  const v = postVisibility(post, now);
  if (v === 'private') return 'Private · only you · backed up to your account';
  if (v === 'public') return 'Public';
  const at = new Date(post.publicAfter!);
  return `Delayed · others see it ${formatDay(etParts(at).ymd)} ${formatTime(at)} ET`;
}
