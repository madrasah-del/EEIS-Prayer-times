// EEIS Official Brand Colours (from brand guidelines)
export const Colors = {
  // Primary palette
  deepBlue: '#0B5EA8',
  blueDeep: '#063968',      // V2 date/time bar background
  freshGreen: '#7AC143',
  greenDark: '#5FA12C',
  maroonRed: '#8C1D40',
  maroonDark: '#6E1432',
  lightGrey: '#F5F5F5',
  ink: '#1A1A1A',
  inkMute: '#6B6B6B',

  // App backgrounds
  bgScreen: '#F5F5F5',
  bgHeader: '#0B5EA8',
  bgCard: '#FFFFFF',
  bgNextPrayer: '#0B5EA8',
  bgProgress: '#E8EEF4',

  // Text
  textWhite: '#FFFFFF',
  textDark: '#1A1A2E',
  textBlue: '#0B5EA8',
  textGreen: '#5A9E2F',
  textMaroon: '#8C1D40',
  textMuted: '#6B7A8D',

  // Begins / Jama'at time colours
  beginsColor: '#0B5EA8',
  jamaatColor: '#0B5EA8',

  // Accents & borders
  accent: '#7AC143',
  border: '#D8E6F3',
  borderStrong: '#0B5EA8',
  divider: '#E2EBF4',

  // Next prayer highlight
  nextCardBg: '#0B5EA8',
  nextCardText: '#FFFFFF',
  nextCardGreen: '#A8D97A',

  // Progress bar (kept for ProgressBar component compatibility)
  progressFill: '#7AC143',
  progressBorder: '#0B5EA8',
  countdownColor: '#8C1D40',
};

export const Typography = {
  // Sizes
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,

  // Weights
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,

  // Font family (Poppins loaded via expo-google-fonts)
  heading: 'Poppins_700Bold',
  subheading: 'Poppins_600SemiBold',
  body: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
};
