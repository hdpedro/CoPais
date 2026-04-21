/**
 * Constants — Kindar Native
 * Copied from web src/lib/constants.ts with zero web dependencies.
 */

export const COLORS = {
  primary: '#5B9E85',
  primaryLight: '#EDF5F1',
  primaryDark: '#4A8A72',
  secondary: '#D4735A',
  accent: '#E8A228',
  dark: '#2C2C2C',
  light: '#EEECEA',
  success: '#4CAF50',
  warning: '#E8A228',
  error: '#E53935',
  muted: '#8A8A8A',
  violet: '#7C6FAE',
} as const;

export const EXPENSE_CATEGORIES = [
  { value: 'education', icon: '🎓' },
  { value: 'health', icon: '🏥' },
  { value: 'food', icon: '🍔' },
  { value: 'clothing', icon: '👕' },
  { value: 'transport', icon: '🚗' },
  { value: 'leisure', icon: '⚽' },
  { value: 'housing', icon: '🏠' },
  { value: 'other', icon: '📦' },
] as const;

export const USER_ROLES = [
  { value: 'parent' },
  { value: 'grandparent' },
  { value: 'caregiver' },
  { value: 'mediator' },
  { value: 'lawyer' },
] as const;

export const PARENT_COLORS = {
  primary: '#5B9E85',
  secondary: '#D4735A',
} as const;

export const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'] as const;

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

export const CUSTODY_TYPE_LABELS: Record<string, string> = {
  regular: 'Regular',
  holiday: 'Feriado',
  swap: 'Troca',
  vacation: 'Ferias',
  special: 'Especial',
};

export const ACTIVITY_CATEGORIES = [
  { value: 'sports', icon: '⚽' },
  { value: 'arts', icon: '🎨' },
  { value: 'music', icon: '🎵' },
  { value: 'education', icon: '📚' },
  { value: 'health', icon: '🏥' },
  { value: 'therapy', icon: '🧠' },
  { value: 'social', icon: '👫' },
  { value: 'other', icon: '📌' },
] as const;

export const CHECKIN_CATEGORIES = [
  { value: 'screen_time', icon: '📱' },
  { value: 'food', icon: '🍽️' },
  { value: 'sleep', icon: '😴' },
  { value: 'mood', icon: '😊' },
  { value: 'health', icon: '🏥' },
  { value: 'hygiene', icon: '🧼' },
  { value: 'other', icon: '📝' },
] as const;

export function getDisplayName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  return fullName.split(' ')[0];
}

/** Get today's date as YYYY-MM-DD in Brazil timezone (same as PWA) */
export function getBrazilToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

/** Get a Date object representing now in Brazil timezone */
export function getBrazilNow(): Date {
  const now = new Date();
  const brazilStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  return new Date(brazilStr);
}

/** Format date as YYYY-MM-DD */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
