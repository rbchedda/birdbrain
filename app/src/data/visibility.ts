import { formatDay, formatTime, etParts } from '@/lib/time';

import type { Post, Visibility } from './types';

export function postVisibility(post: Pick<Post, 'publicAfter'>, now = new Date()): Visibility {
  if (!post.publicAfter) return 'private';
  return new Date(post.publicAfter) > now ? 'delayed' : 'public';
}

/** Local wall-clock time, e.g. "3:40 PM". */
export function formatLocalTime(d: Date) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
}

/** Local calendar day, e.g. "Tue, Nov 11". */
export function formatLocalDay(d: Date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}

/** Author-facing label for when a pending post goes live, in the device's time zone. */
export function goesPublicLabel(publicAfter: string, now = new Date()) {
  const at = new Date(publicAfter);
  const time = formatLocalTime(at);
  const sameDay =
    at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  return sameDay ? `Goes public at ${time}` : `Goes public at ${time} on ${formatLocalDay(at)}`;
}

export function visibilityText(post: Pick<Post, 'publicAfter'>, now = new Date()) {
  const v = postVisibility(post, now);
  if (v === 'private') return 'Private · only you · backed up to your account';
  if (v === 'public') return 'Public';
  return goesPublicLabel(post.publicAfter!, now);
}

/** Kept for date+ET notices that still describe the server-owned delay. */
export function publicAfterEtText(publicAfter: string) {
  const at = new Date(publicAfter);
  return `${formatDay(etParts(at).ymd)} ${formatTime(at)} ET`;
}
