/**
 * Bird photo licensing lint, run by `npm test` (src/__tests__/birdCredits.test.ts).
 * Every image in assets/birds must have a CREDITS.json entry and vice versa,
 * licenses must be on the allow-list, CC BY* needs an author, and nothing may
 * come from eBird or the Macaulay Library.
 */
export interface BirdCredit {
  file: string;
  species: string;
  title: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  retrieved: string;
  changes: string;
}

export const IMAGE_EXT = /\.(webp|png|jpe?g)$/i;
/** US federal government works (public domain, 17 U.S.C. § 105): an author/agency credit is still required. */
const US_FEDERAL_PD = /^PD-(USFWS|USGov-FWS)$/;
const ALLOWED = [/^PD$/, US_FEDERAL_PD, /^CC0-1\.0$/, /^CC-BY-\d/, /^CC-BY-SA-\d/];
const BANNED_HOSTS = /(^|\/\/|\.)(ebird\.org|macaulaylibrary\.org)/i;
const FIELDS: (keyof BirdCredit)[] = ['file', 'species', 'title', 'sourceUrl', 'author', 'license', 'licenseUrl', 'retrieved', 'changes'];

export const licenseAllowed = (license: string) => !/NC|ND/.test(license) && ALLOWED.some((r) => r.test(license));

/** Problems with a set of credits against the image files present; empty when all is well. */
export function checkCredits(files: string[], credits: BirdCredit[]): string[] {
  const errors: string[] = [];
  const images = files.filter((f) => IMAGE_EXT.test(f));
  const byFile = new Map(credits.map((c) => [c.file, c]));
  for (const f of images) if (!byFile.has(f)) errors.push(`${f}: no CREDITS.json entry`);
  for (const c of credits) {
    const id = c.file || '(no file)';
    if (!images.includes(c.file)) errors.push(`${id}: listed in CREDITS.json but the file is missing`);
    for (const k of FIELDS) {
      const v = c[k];
      const optional = k === 'author' && c.license === 'PD';
      if (!optional && (typeof v !== 'string' || !v.trim())) errors.push(`${id}: missing ${k}`);
    }
    if (c.sourceUrl && !/^https:\/\//.test(c.sourceUrl)) errors.push(`${id}: sourceUrl must be an https URL`);
    if (/^CC/.test(c.license ?? '') && !/^https:\/\/creativecommons\.org\/(licenses|publicdomain)\//.test(c.licenseUrl ?? '')) {
      errors.push(`${id}: licenseUrl must be the creativecommons.org deed`);
    }
    if (US_FEDERAL_PD.test(c.license ?? '') && !/^https:\/\//.test(c.licenseUrl ?? '')) {
      errors.push(`${id}: licenseUrl must link the public-domain basis`);
    }
    if (c.retrieved && !/^\d{4}-\d{2}-\d{2}$/.test(c.retrieved)) errors.push(`${id}: retrieved must be YYYY-MM-DD`);
    if (!licenseAllowed(c.license ?? '')) errors.push(`${id}: license "${c.license}" is not allowed`);
    if (BANNED_HOSTS.test(c.sourceUrl ?? '')) errors.push(`${id}: eBird / Macaulay Library sources are not allowed`);
  }
  return errors;
}
