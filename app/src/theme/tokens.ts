export const colors = {
  ground: '#0E1A13',
  surface: '#17261E',
  surfaceRaised: '#1F3328',
  border: '#2A4A38',
  text: '#F2F4EF',
  muted: '#9FB2A5',
  accent: '#FF6A1F',
  onAccent: '#0E1A13',
  dove: '#E8C468',
  onDove: '#0E1A13',
  danger: '#FF8A80',
  success: '#8FD19E',
  /** State park outline (DCNR): blue dashed, unlike SGL/place styling, never an "open" color. */
  park: '#7DB8FF',
} as const;

export const fonts = {
  heading: 'BarlowCondensed_700Bold',
  headingSemi: 'BarlowCondensed_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

/** Minimum touch target, per the design brief. */
export const touchTarget = 44;

/**
 * Map palette (birdbrain-map-style spec §2a), separate from the UI tokens so
 * the map can change without touching the app. Orange (#FF6A1F) is reserved
 * for stocking pins and the selected-place outline; contours use "ember".
 */
export const mapColors = {
  bg: '#0E1A13',
  relief: ['#0E1A13', '#142A1E', '#1C3828', '#264733', '#355A41', '#4A6E52'],
  /** color-relief stops in meters (100–900 m), paired with relief[]. */
  reliefStopsM: [100, 250, 400, 550, 700, 900],
  hillshade: { shadow: '#08110C', highlight: '#5E8466', accent: '#1C3828' },
  contour: { major: '#D96A35', majorOpacity: 0.85, minor: '#FFA270', minorOpacity: 0.28, label: '#FFA270' },
  halo: '#0E1A13',
  water: { fill: '#0F2A2E', line: '#3E7A86', lineSat: '#7FB7C2', labelSat: '#C9E3E8' },
  road: '#9FB2A5',
  roadSat: '#F2F4EF',
  place: '#9FB2A5',
  placeSat: '#F2F4EF',
  sgl: { line: '#E8C468', fillOpacity: 0.16, fillOpacitySat: 0.22 },
  zone: '#9FB2A5',
  satScrim: 'rgba(14,26,19,0.10)',
  /** Selected place: orange line over a dark casing, never a fill (RBChedda, Oct 22). */
  selected: { line: '#FF6A1F', width: 3, casing: '#0E1A13', casingWidth: 6 },
} as const;
