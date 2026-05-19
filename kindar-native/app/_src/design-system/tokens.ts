/**
 * Design Tokens — Kindar Native
 * Light theme matching the web app (kindar.com.br).
 */

export const colors = {
  // Brand
  brand: '#5B9E85',
  brandDark: '#4A8A72',
  brandLight: '#EDF5F1',
  brandGlow: 'rgba(91,158,133,0.1)',

  // Accent
  secondary: '#D4735A',
  secondaryLight: 'rgba(212,115,90,0.12)',
  accent: '#E8A228',
  accentLight: 'rgba(232,162,40,0.12)',
  violet: '#7C6FAE',

  // Auth palette (terracotta — matches PWA login)
  authPrimary: '#C07055',
  authPrimaryDark: '#A85D47',
  authMuted: '#9A8878',
  authBorder: '#E8E0D4',
  authText: '#0E0C0A',

  // Background (cream cohere com bg do logo Kindar #F5EBE1, atualizado 2026-05-19)
  bg: '#F5EBE1',
  bgElevated: '#FFFFFF',
  bgSurface: '#F0E6DB',
  bgCard: '#FFFFFF',

  // Text
  text: '#2C2C2C',
  textSecondary: 'rgba(44,44,44,0.7)',
  textMuted: 'rgba(44,44,44,0.5)',
  textDim: 'rgba(44,44,44,0.3)',

  // Semantic
  success: '#4CAF50',
  error: '#E53935',
  warning: '#E8A228',
  info: '#3b82f6',

  // Border
  border: 'rgba(44,44,44,0.1)',
  borderLight: 'rgba(44,44,44,0.06)',

  // Custody colors
  custody: {
    primary: '#5B9E85',   // Lar A (criador) = Sage
    secondary: '#D4735A', // Lar B (convidado) = Terracota
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const font = {
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    '2xl': 22,
    '3xl': 28,
    '4xl': 34,
  },
  weights: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
} as const;
