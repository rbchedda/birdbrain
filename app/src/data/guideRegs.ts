import { PGC_DIGEST_URL, PGC_SEASONS_URL, REGS, SE_PARK_SUNDAY_NOTE } from './regs';

/**
 * Regulation topics for the Guide. Static, versioned summaries that each send
 * the reader to the PGC digest; they are pointers, not the rules themselves.
 * Bump GUIDE_REGS_VERSION on every edit and have a second person check it
 * against the digest.
 */
export const GUIDE_REGS_VERSION = `${REGS.version}+guide.1`;

export interface RegTopic {
  key: 'licenses' | 'orange' | 'sunday' | 'sgl' | 'nontoxic';
  title: string;
  points: string[];
  url: string;
}

export const regTopics: RegTopic[] = [
  {
    key: 'licenses',
    title: 'Licenses and permits',
    points: [
      'A Pennsylvania hunting license, carried on you while hunting.',
      'Pheasant permit for adults hunting pheasants.',
      'Migratory game bird license for doves, woodcock and waterfowl; federal duck stamp for waterfowl.',
    ],
    url: PGC_DIGEST_URL,
  },
  {
    key: 'orange',
    title: 'Fluorescent orange',
    points: [
      'Small game: 250 sq in of fluorescent orange on the head, chest and back combined, visible 360°.',
      'Rules differ for turkey and migratory birds and by season: check the digest.',
    ],
    url: PGC_DIGEST_URL,
  },
  {
    key: 'sunday',
    title: 'Sunday hunting',
    points: [
      'Every season includes Sundays except migratory birds (doves, waterfowl).',
      SE_PARK_SUNDAY_NOTE,
    ],
    url: PGC_DIGEST_URL,
  },
  {
    key: 'sgl',
    title: 'State Game Lands rules',
    points: [
      'SGLs have their own rules (vehicles, camping, target shooting, dog training, hours). Read the SGL section of the digest before you go.',
      'Some SGLs and managed dove fields require non-toxic shot.',
    ],
    url: PGC_DIGEST_URL,
  },
  {
    key: 'nontoxic',
    title: 'Non-toxic shot',
    points: [
      'Required for waterfowl everywhere (federal rule).',
      'Required on designated SGLs and fields for other small game: the digest lists them.',
    ],
    url: PGC_SEASONS_URL,
  },
];
