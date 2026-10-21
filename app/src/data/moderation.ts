/**
 * Mirror of public.blocklist_terms / contains_objectionable() in
 * supabase/migrations/20261023000000_moderation_e2e.sql, so the sample backend
 * rejects the same text. The database is the source of truth.
 */
export const blocklist = [
  'fuck', 'fucking', 'motherfucker', 'cunt', 'nigger', 'nigga', 'faggot', 'fag',
  'retard', 'kike', 'spic', 'chink', 'wetback', 'tranny', 'whore', 'slut',
];

export const OBJECTIONABLE_MESSAGE = 'objectionable content: this breaks the community rules';

/** Whole-word, case-insensitive, same normalisation as the SQL function. */
export function containsObjectionable(text: string | null | undefined) {
  if (!text) return false;
  const words = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return blocklist.some((t) => words.includes(` ${t} `));
}

export const RULES_VERSION = 1;

export const communityRules: { title: string; body: string }[] = [
  { title: 'No live game alerts', body: 'Posts and comments go public the next day. Don’t use them to point other hunters at birds right now.' },
  { title: 'Respect private locations', body: 'Never share someone’s exact spot, property or address.' },
  { title: 'No harassment or hate', body: 'No slurs, threats, bullying or attacks on anyone. Objectionable language is blocked automatically.' },
  { title: 'Hunt legally', body: 'No content promoting poaching, trespass or other illegal activity.' },
  { title: 'No graphic or sexual content', body: 'Harvest photos are fine; gratuitous gore and sexual content are not.' },
  { title: 'No spam', body: 'No ads, scams or repeated posts.' },
  { title: 'Report and block', body: 'Use ⋯ on any post, comment or profile to report or block. Content reported by several hunters is hidden until a moderator reviews it, usually within 24 hours, and violators are removed.' },
];
