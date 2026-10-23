import { birds, type BirdKey } from '@/data/birds';

/** Guide menu copy (approved mockup birdbrain-polish/guide/png/01-guide.png). No bag limits in rows. */
export const GUIDE_PURPOSE = 'Everything you need to hunt PA birds legally: seasons, rules, and how to find each species.';

export type GuideRow = { key: string; icon: string; title: string; desc: string; href: string };

export const BEFORE_YOU_GO: GuideRow[] = [
  { key: 'hours', icon: '◷', title: 'Seasons & legal hours', desc: "What's open this week and today's shooting times", href: '/guide/hours' },
  { key: 'rules', icon: '§', title: 'Rules & licenses', desc: 'Licenses, orange requirements, shot and dog rules', href: '/guide/regs' },
  // No stocking screen exists yet; the map shows the PGC stocking pins.
  { key: 'trip', icon: '⌂', title: 'Plan a trip', desc: 'Stocking release weeks and where they happen', href: '/' },
];

/** Row descriptions; the first four are verbatim from 01-guide, turkey and bobwhite are not in the mockup. */
export const BIRD_DESC: Record<BirdKey, string> = {
  pheasant: 'Stocked on game lands · fields & hedgerows',
  grouse: 'Young forest and edges · native',
  woodcock: 'Wet thickets · migratory, needs HIP',
  dove: 'Cut grain fields · split season',
  turkey: 'Mature woods and field edges · fall and spring',
  bobwhite: 'Small quail · coveys in brushy fields',
};

export const BIRD_ROWS: GuideRow[] = birds.map((b) => ({
  key: b.key,
  icon: b.key.slice(0, 2).replace(/^./, (c) => c.toUpperCase()),
  title: b.name,
  desc: BIRD_DESC[b.key] ?? '',
  href: `/guide/bird/${b.key}`,
}));

export const LEARN: GuideRow[] = [
  // Gear checklist is the current home for new-hunter basics.
  { key: 'basics', icon: '?', title: 'Hunting basics', desc: 'Safety, dogs, and field care for new hunters', href: '/guide/gear' },
];
