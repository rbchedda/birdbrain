import type { Species } from './types';

/**
 * Bird ID content for the Guide. Field marks and look-alikes are general field
 * guide knowledge, written for hunters. Photos come later (feat/guide-bird-photos):
 * each entry names the image files it will use, which must then be listed in
 * app/assets/birds/CREDITS.json. Until then the cards show a grey placeholder.
 */
export type BirdKey = 'pheasant' | 'grouse' | 'woodcock' | 'dove' | 'turkey' | 'bobwhite';

export interface BirdId {
  key: BirdKey;
  name: string;
  /** Link to the regs/season data, when the bird has its own entry there. */
  species: Species | null;
  /** Photo slots, e.g. rooster and hen; `file` is the planned assets/birds file name. */
  photos: { label: string; file: string }[];
  fieldMarks: string[];
  lookAlikes: string[];
  /** Shown when the bird has no entry in regs.ts / seasons.ts. */
  regsNote?: string;
}

export const birds: BirdId[] = [
  {
    key: 'pheasant',
    name: 'Ring-necked pheasant',
    species: 'pheasant',
    photos: [
      { label: 'Rooster', file: 'pheasant-rooster.webp' },
      { label: 'Hen', file: 'pheasant-hen.webp' },
    ],
    fieldMarks: [
      'Rooster: iridescent green-purple head, red face wattles, white neck ring, copper body, long barred tail.',
      'Hen: mottled buff-brown all over, long pointed tail, no ring or wattles.',
      'Flushes loud and steep, often cackling (roosters); tail is longer than the body.',
    ],
    lookAlikes: [
      'Ruffed grouse (shorter, fan-shaped tail with a dark band).',
      'Hen pheasant vs. rooster in poor light: check the tail length and the white ring before you shoot where hens are not legal.',
    ],
  },
  {
    key: 'grouse',
    name: 'Ruffed grouse',
    species: 'grouse',
    photos: [{ label: 'Ruffed grouse', file: 'ruffed-grouse.webp' }],
    fieldMarks: [
      'Chicken-sized, gray or red-brown phases, with a small crest.',
      'Fan-shaped tail with a broad dark band near the tip.',
      'Dark "ruff" feathers on the neck; explosive, drumming flush in young forest.',
    ],
    lookAlikes: ['Hen pheasant (much longer, pointed tail; open fields rather than woods).', 'Woodcock (far smaller, long bill).'],
  },
  {
    key: 'woodcock',
    name: 'American woodcock',
    species: null,
    photos: [{ label: 'American woodcock', file: 'american-woodcock.webp' }],
    fieldMarks: [
      'Plump, robin-to-pigeon size, with a very long straight bill and big dark eyes set high on the head.',
      'Leaf-litter camouflage: buff, rust and black bars on the crown.',
      'Twittering wing whistle on the flush; flies up through alders and young woods.',
    ],
    lookAlikes: ['Wilson’s snipe (open wet meadows, striped back, zig-zag flight).'],
    regsNote: 'Woodcock is a migratory game bird with its own season and limits: check the PGC digest.',
  },
  {
    key: 'dove',
    name: 'Mourning dove',
    species: 'dove',
    photos: [{ label: 'Mourning dove', file: 'mourning-dove.webp' }],
    fieldMarks: [
      'Slim, gray-tan body with a small head and long pointed tail edged in white.',
      'Black spots on the wings; fast, direct flight with whistling wings.',
    ],
    lookAlikes: [
      'Rock pigeon (stockier, square tail).',
      'Eurasian collared-dove (paler, black half-collar, square tail).',
      'Small hawks and kestrels (protected): hooked bill, different flight. Be sure before you shoot.',
    ],
  },
  {
    key: 'turkey',
    name: 'Wild turkey',
    species: 'turkey',
    photos: [
      { label: 'Gobbler', file: 'wild-turkey-gobbler.webp' },
      { label: 'Hen', file: 'wild-turkey-hen.webp' },
    ],
    fieldMarks: [
      'Very large, dark bronze body; bare head (red, white and blue on gobblers in spring).',
      'Gobblers: beard on the chest and spurs on the legs. Some hens have beards too.',
      'Spring season is bearded birds only: confirm the beard, not just the head color.',
    ],
    lookAlikes: ['Domestic or feral turkeys near farms (often white-tipped tail feathers).'],
  },
  {
    key: 'bobwhite',
    name: 'Northern bobwhite',
    species: null,
    photos: [{ label: 'Northern bobwhite', file: 'northern-bobwhite.webp' }],
    fieldMarks: [
      'Small, round, rusty-brown quail with a short tail.',
      'Male: white throat and eye stripe; female: buff throat and eye stripe.',
      'Covey flush: many birds at once, low and fast.',
    ],
    lookAlikes: ['Released pen-raised quail.', 'Young ruffed grouse or hen pheasant chicks in summer (not in season).'],
    regsNote: 'Bobwhite seasons and open areas are limited in Pennsylvania: check the PGC digest before hunting.',
  },
];

export const birdByKey = (key: string) => birds.find((b) => b.key === key) ?? null;
