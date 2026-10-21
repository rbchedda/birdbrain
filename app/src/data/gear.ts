import type { BirdKey } from './birds';

/**
 * Gear needed, per species. Educational checklists only: no products, brands,
 * store links or marketplace. Legal requirements (orange, licenses, non-toxic
 * shot) point at the PGC digest, which is the final word.
 */
export const GEAR_VERSION = '2026-27.1';

export interface GearItem {
  label: string;
  /** Legal requirement (vs. a suggestion); shown with "verify with the digest". */
  required?: boolean;
}

const license: GearItem = { label: 'Hunting license (plus any permits below) carried on you', required: true };
const orange: GearItem = { label: '250 sq in of fluorescent orange on head, chest and back, visible 360° (small game)', required: true };
const dogGear: GearItem = { label: 'Dog: water, bowl, first-aid kit, orange vest or collar, ID tag' };
const basics: GearItem = { label: 'Eye and ear protection, water, map of the game land (offline)' };

export const gear: Record<BirdKey, GearItem[]> = {
  pheasant: [
    license,
    { label: 'Pheasant permit (adults)', required: true },
    orange,
    { label: '12 or 20 gauge; #5–#6 shot is common. Non-toxic shot where an SGL or field requires it' },
    dogGear,
    basics,
  ],
  grouse: [
    license,
    orange,
    { label: '20 or 12 gauge, open choke; #7½–#8 shot is common' },
    { label: 'Brush pants or chaps, gloves' },
    dogGear,
    basics,
  ],
  woodcock: [
    license,
    { label: 'Migratory game bird license (HIP)', required: true },
    { label: 'Orange rules for migratory birds differ from small game: check the digest', required: true },
    { label: '20 or 12 gauge, open choke; #8–#9 shot is common' },
    dogGear,
    basics,
  ],
  dove: [
    license,
    { label: 'Migratory game bird license (HIP)', required: true },
    { label: 'Plug the shotgun to 3 shells (federal migratory bird rule)', required: true },
    { label: '12 or 20 gauge; #7½–#8 shot is common. Non-toxic shot on fields that require it' },
    { label: 'Camo or drab clothing, stool, shade, plenty of water' },
    basics,
  ],
  turkey: [
    license,
    { label: 'Turkey tag(s) for the season', required: true },
    { label: 'Orange rules for turkey differ from small game and by season: check the digest', required: true },
    { label: 'Shotgun with turkey loads, or other legal sporting arm for the season and WMU (see digest)' },
    { label: 'Calls, seat cushion, full camo (with orange where required)' },
    basics,
  ],
  bobwhite: [
    license,
    { label: 'Season, limits and open areas: check the digest before going', required: true },
    orange,
    { label: '20 or 28 gauge, open choke; #7½–#8 shot is common' },
    dogGear,
    basics,
  ],
};
