export type Species = 'pheasant' | 'dove' | 'turkey' | 'grouse' | 'waterfowl';

export type PlaceType = 'game_land' | 'stocking' | 'dove_field';

export interface Place {
  id: string;
  name: string;
  type: PlaceType;
  county: string;
  species: Species[];
  /** Position on the placeholder map, 0..1 of width/height. Replaced by real geometry later. */
  pin: { x: number; y: number };
  note: string;
  stockingWindow?: string;
}

export interface Post {
  id: string;
  author: string;
  avatarInitials: string;
  species: Species;
  /** Always a coarse, blurred area — never exact coordinates. */
  area: string;
  postedAgo: string;
  caption: string;
  photoTint: string;
  likes: number;
  comments: number;
  group?: string;
}

export const speciesLabel: Record<Species, string> = {
  pheasant: 'Pheasant',
  dove: 'Dove',
  turkey: 'Turkey',
  grouse: 'Grouse',
  waterfowl: 'Waterfowl',
};

export const migratory: Species[] = ['dove', 'waterfowl'];
