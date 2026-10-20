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
