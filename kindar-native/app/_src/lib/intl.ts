/**
 * intl.ts — formatação de data/hora/número/moeda LOCALE-AWARE (Kindar Native).
 *
 * Antes, o app tinha ~50 sites com `toLocaleDateString('pt-BR')`, arrays
 * hardcoded de dia/mês (`['Dom','Seg',...]`, `['jan',...]`), e helpers manuais
 * `DD/MM/YYYY` — nenhum reagia ao idioma escolhido. Este módulo centraliza tudo
 * em `Intl.*` keyed no locale ativo (`useI18n().locale`).
 *
 * USO (em componente — reativo na troca de idioma):
 *   const { formatDate, formatRelativeDay, formatMonthYear } = useIntl();
 *   <Text>{formatDate(activity.date)}</Text>
 *
 * USO (fora de componente / helper module-level): passe o locale BCP-47:
 *   import { fmtDate, toIntlLocale } from 'src/lib/intl';
 *   fmtDate(d, toIntlLocale(locale))
 *
 * NOTA (verificar no device durante os testes): depende do Hermes ter os dados
 * de locale de Intl (Expo SDK54 Hermes tem Intl; se es/fr/de vierem com nomes em
 * inglês, adicionar polyfills @formatjs/intl-datetimeformat + locale-data).
 */
import { useMemo } from 'react';
import { useI18n } from 'src/i18n';

/** App locale (pt/en/es/fr/de) → BCP-47 (CLDR) usado pelo Intl. */
export const INTL_LOCALE_MAP: Record<string, string> = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
};

export function toIntlLocale(locale: string | undefined): string {
  return (locale && INTL_LOCALE_MAP[locale]) || 'pt-BR';
}

type DateInput = Date | string | number;

/** Converte entrada em Date. ISO 'YYYY-MM-DD' vira meio-dia LOCAL (evita shift de
 *  fuso que joga pro dia anterior — convenção usada no app inteiro). */
export function toDate(d: DateInput): Date {
  if (d instanceof Date) return d;
  if (typeof d === 'number') return new Date(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d + 'T12:00:00');
  return new Date(d);
}

// ── Formatters puros (recebem locale BCP-47) ────────────────────────────────
export function fmtDate(
  d: DateInput,
  intlLocale: string,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat(intlLocale, opts).format(toDate(d));
}
export function fmtDateShort(d: DateInput, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, { day: '2-digit', month: 'short' }).format(toDate(d));
}
export function fmtTime(d: DateInput, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, { hour: '2-digit', minute: '2-digit' }).format(toDate(d));
}
export function fmtMonthYear(d: DateInput, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, { month: 'long', year: 'numeric' }).format(toDate(d));
}
export function fmtWeekdayShort(d: DateInput, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, { weekday: 'short' }).format(toDate(d));
}
export function fmtMonthShort(d: DateInput, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, { month: 'short' }).format(toDate(d));
}
export function fmtCurrencyBRL(value: number, intlLocale: string): string {
  return new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'BRL' }).format(value);
}
export function fmtNumber(value: number, intlLocale: string): string {
  return new Intl.NumberFormat(intlLocale).format(value);
}

/** Diferença em dias (calendário) entre `d` e hoje (positivo = passado). */
function diffDaysFromToday(d: DateInput): number {
  const date = toDate(d);
  date.setHours(12, 0, 0, 0);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((today.getTime() - date.getTime()) / 86_400_000);
}

// ── Hook reativo (bound no locale ativo) ────────────────────────────────────
export function useIntl() {
  const locale = useI18n((s) => s.locale);
  const t = useI18n((s) => s.t);
  const il = toIntlLocale(locale);
  return useMemo(
    () => ({
      locale: il,
      formatDate: (d: DateInput, opts?: Intl.DateTimeFormatOptions) => fmtDate(d, il, opts),
      formatDateShort: (d: DateInput) => fmtDateShort(d, il),
      formatTime: (d: DateInput) => fmtTime(d, il),
      formatDateTime: (d: DateInput) => `${fmtDate(d, il)} ${fmtTime(d, il)}`,
      formatMonthYear: (d: DateInput) => fmtMonthYear(d, il),
      formatWeekdayShort: (d: DateInput) => fmtWeekdayShort(d, il),
      formatMonthShort: (d: DateInput) => fmtMonthShort(d, il),
      formatCurrency: (v: number) => fmtCurrencyBRL(v, il),
      formatNumber: (v: number) => fmtNumber(v, il),
      /** "Hoje" / "Ontem" / "Amanhã" / "há N dias" (i18n via t('intl.*')). */
      formatRelativeDay: (d: DateInput): string => {
        const diff = diffDaysFromToday(d);
        if (diff === 0) return t('intl.today');
        if (diff === 1) return t('intl.yesterday');
        if (diff === -1) return t('intl.tomorrow');
        if (diff > 1) return t('intl.daysAgo', { count: diff });
        return fmtDate(d, il);
      },
    }),
    [il, t],
  );
}
