import { PGC_DIGEST_URL, PGC_SEASONS_URL, REGS, SE_PARK_SUNDAY_NOTE } from './regs';

/**
 * Regulation topics for the Guide. Static, versioned summaries that each send
 * the reader to the PGC digest; they are pointers, not the rules themselves.
 * Bump GUIDE_REGS_VERSION on every edit and have a second person check it
 * against the digest.
 */
export const GUIDE_REGS_VERSION = `${REGS.version}+guide.2`;

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
      'Pheasant permit: all adults and some seniors need the $26.97 permit. Junior hunters and mentored hunters under 17 need a free permit. It must be signed and carried. Senior lifetime license holders from before May 13, 2017 are exempt.',
      'Migratory game bird license (HIP) for doves, woodcock and waterfowl.',
      'Federal duck stamp for waterfowl hunters 16 and older.',
    ],
    url: PGC_DIGEST_URL,
  },
  {
    key: 'orange',
    title: 'Fluorescent orange',
    points: [
      'Small game: 250 sq in of fluorescent orange on the head, chest and back combined, visible 360°.',
      'Woodcock is small game: the same 250 sq in orange rule applies.',
      'No fluorescent orange required in either turkey season (strongly recommended).',
      'Not required for doves or waterfowl.',
    ],
    url: PGC_DIGEST_URL,
  },
  {
    key: 'sunday',
    title: 'Sunday hunting',
    points: [
      'Sundays are open in nearly all seasons, but closed for migratory game birds, including waterfowl, mourning doves and woodcock (also snipe, rails, gallinules, brant).',
      'Crows are the exception: open Sundays.',
      SE_PARK_SUNDAY_NOTE,
    ],
    url: PGC_DIGEST_URL,
  },
  {
    key: 'sgl',
    title: 'State Game Lands rules',
    points: [
      'SGLs have their own rules (vehicles, camping, target shooting, dog training, hours). Read the SGL section of the digest before you go.',
    ],
    url: PGC_DIGEST_URL,
  },
  {
    key: 'nontoxic',
    title: 'Non-toxic shot',
    points: [
      'Required for waterfowl everywhere (federal rule).',
      'Lead fine shot (#4 lead or smaller) is legal for small game.',
    ],
    url: PGC_SEASONS_URL,
  },
];
