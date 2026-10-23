import { birds, type BirdKey } from '@/data/birds';

/** Guide menu copy (approved mockup birdbrain-polish/guide/png/01-guide.png). No bag limits in rows. */
export const GUIDE_PURPOSE = 'Everything you need to hunt PA birds legally: seasons, rules, and how to find each species.';

export type GuideRow = { key: string; icon: string; title: string; desc: string; href: string };

export const BEFORE_YOU_GO: GuideRow[] = [
  { key: 'hours', icon: '◷', title: 'Seasons & legal hours', desc: "What's open this week and today's shooting times", href: '/guide/hours' },
  { key: 'rules', icon: '§', title: 'Rules & licenses', desc: 'Licenses, orange requirements, shot and dog rules', href: '/guide/regs' },
  // Opens the Map with a one-time hint (PlanTripHint).
  { key: 'trip', icon: '⌂', title: 'Plan a trip', desc: "Pick a spot on the map, check the day's legal hours and weather, and save a plan.", href: '/?hint=plan' },
];

/** Row descriptions; the first four are verbatim from 01-guide, turkey and bobwhite are designer follow-up copy (PR #48). */
export const BIRD_DESC: Record<BirdKey, string> = {
  pheasant: 'Stocked on game lands · fields & hedgerows',
  grouse: 'Young forest and edges · native',
  woodcock: 'Wet thickets · migratory, needs HIP',
  dove: 'Cut grain fields · split season',
  turkey: 'Where fall flocks feed and roost, which areas are open, and how the fall season works.',
  bobwhite: 'Where you can hunt quail in PA, mostly release areas and preserves, plus season basics.',
};

/** Guide row titles that differ from birds.ts names (engineer-approved). */
export const BIRD_TITLE: Partial<Record<BirdKey, string>> = { turkey: 'Fall turkey', bobwhite: 'Bobwhite quail' };

export const BIRD_ROWS: GuideRow[] = birds.map((b) => ({
  key: b.key,
  icon: b.key.slice(0, 2).replace(/^./, (c) => c.toUpperCase()),
  title: BIRD_TITLE[b.key] ?? b.name,
  desc: BIRD_DESC[b.key] ?? '',
  href: `/guide/bird/${b.key}`,
}));

export const LEARN: GuideRow[] = [
  // Gear checklist is the current home for new-hunter basics.
  { key: 'basics', icon: '?', title: 'Hunting basics', desc: 'What to bring, safety orange rules, and first-hunt tips.', href: '/guide/gear' },
];
