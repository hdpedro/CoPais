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

// Labels mirror PWA i18n `expenses.categories.*` so users see the same
// names on web and native — previously the native form rendered the raw
// `value` ("food" / "transport") instead of the translated label.
export const EXPENSE_CATEGORIES = [
  { value: 'education', label: 'Educação', icon: '🎓' },
  { value: 'health', label: 'Saúde', icon: '🏥' },
  { value: 'food', label: 'Alimentação', icon: '🍔' },
  { value: 'clothing', label: 'Vestuário', icon: '👕' },
  { value: 'transport', label: 'Transporte', icon: '🚗' },
  { value: 'leisure', label: 'Lazer', icon: '⚽' },
  { value: 'housing', label: 'Moradia', icon: '🏠' },
  { value: 'other', label: 'Outros', icon: '📦' },
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

export const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

export const CUSTODY_TYPE_LABELS: Record<string, string> = {
  regular: 'Regular',
  holiday: 'Feriado',
  swap: 'Troca',
  vacation: 'Férias',
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

/**
 * Normaliza nome pra exibir na UI. Espelha `src/lib/constants.ts:getDisplayName`
 * (PWA) — mesma assinatura, mesmo comportamento.
 *
 * Por que `firstOnly` default `false`:
 *   Bug Fernanda 2026-05-14: criança chamada "Julio Cesar" aparecia só como
 *   "Julio" porque o helper antigo SEMPRE quebrava no primeiro espaço. Nomes
 *   compostos PT-BR (Julio Cesar, Maria Eduarda, Ana Clara) são comuns e
 *   parte do nome próprio — não devem ser truncados. Default agora é nome
 *   completo; chamadas que precisam compacto (greeting, lista de membros,
 *   expense paid-by) passam `, true` explicitamente.
 *
 * Retorna `''` pra entrada vazia (não "Usuário") porque vários callers usam
 * o padrão `getDisplayName(x) || 'Fallback'` — mantém compat.
 *
 * Defensivo pra email acidental: `henrique.de.pedro@gmail.com` →
 * "Henrique De Pedro" (mesma lógica do PWA).
 */
export function getDisplayName(fullName: string | null | undefined, firstOnly = false): string {
  if (!fullName || !fullName.trim()) return '';
  let normalized = fullName.trim();
  if (normalized.includes('@')) {
    normalized = normalized.split('@')[0]
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return firstOnly ? normalized.split(' ')[0] : normalized;
}

// ---------- Quick Actions ----------

export interface QuickActionDefNative {
  id: string;
  href: string;
  color: string;
  defaultLabel: string;
  icon: string; // Ionicons name
}

export const QUICK_ACTIONS_CATALOG_NATIVE: QuickActionDefNative[] = [
  { id: 'nova-despesa',   href: '/despesas/nova',      color: '#D4735A', defaultLabel: 'Nova despesa',      icon: 'add-circle-outline' },
  { id: 'calendario',     href: '/(tabs)/calendario',  color: '#5B9E85', defaultLabel: 'Agenda',            icon: 'calendar-outline' },
  { id: 'financeiro',     href: '/financeiro',         color: '#5B9E85', defaultLabel: 'Financeiro',        icon: 'cash-outline' },
  { id: 'saude',          href: '/(tabs)/saude',       color: '#EF4444', defaultLabel: 'Saúde',             icon: 'heart-outline' },
  { id: 'acordos',        href: '/acordos',            color: '#F59E0B', defaultLabel: 'Acordos',           icon: 'reader-outline' },
  { id: 'documentos',     href: '/documentos',         color: '#F59E0B', defaultLabel: 'Documentos',        icon: 'document-outline' },
  { id: 'decisoes',       href: '/decisoes',           color: '#8B5CF6', defaultLabel: 'Decisões',          icon: 'checkmark-circle-outline' },
  { id: 'notas',          href: '/notas',              color: '#3B82F6', defaultLabel: 'Notas',             icon: 'pencil-outline' },
  { id: 'nova-atividade', href: '/atividades/nova',    color: '#22C55E', defaultLabel: 'Nova atividade',    icon: 'fitness-outline' },
  { id: 'novo-evento',    href: '/calendario/novo',    color: '#5B9E85', defaultLabel: 'Novo evento',       icon: 'calendar-number-outline' },
  { id: 'nova-consulta',  href: '/saude/consultas',    color: '#EF4444', defaultLabel: 'Nova consulta',     icon: 'medkit-outline' },
  { id: 'checkin',        href: '/checkin',            color: '#F59E0B', defaultLabel: 'Check-in',          icon: 'checkmark-done-outline' },
  { id: 'semana',         href: '/semana',             color: '#3B82F6', defaultLabel: 'Análise semanal',   icon: 'stats-chart-outline' },
  { id: 'escola',         href: '/escola',             color: '#8B5CF6', defaultLabel: 'Escola',            icon: 'school-outline' },
  { id: 'criancas',       href: '/criancas',           color: '#22C55E', defaultLabel: 'Crianças',          icon: 'people-outline' },
];

export const DEFAULT_QUICK_ACTIONS_NATIVE = {
  primary: 'nova-despesa',
  secondary: ['calendario', 'semana', 'documentos', 'financeiro', 'acordos', 'saude'],
} as const;

// ---------- Dates ----------

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
