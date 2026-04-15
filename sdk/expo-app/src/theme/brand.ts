import { Platform } from 'react-native';

export const BRAND_FONTS = {
  displayBold: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  bodyRegular: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export const OTT_COLORS = {
  background: '#04070f',
  panel: 'rgba(8, 15, 30, 0.86)',
  panelMuted: 'rgba(10, 21, 40, 0.8)',
  border: 'rgba(71, 85, 105, 0.45)',
  borderBright: 'rgba(56, 189, 248, 0.5)',
  textPrimary: '#f8fafc',
  textSecondary: '#c4d2ea',
  textMuted: '#7e93b4',
  accent: '#22d3ee',
} as const;
