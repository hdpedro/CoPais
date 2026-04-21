/**
 * i18n — Kindar Native
 * Lightweight i18n using the same JSON locale files from the web app.
 */

import { create } from 'zustand';
import pt from './locales/pt.json';

type Translations = Record<string, unknown>;

interface I18nState {
  locale: string;
  translations: Translations;
  setLocale: (locale: string) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LOCALES: Record<string, () => Promise<Translations>> = {
  pt: async () => pt,
  en: async () => (await import('./locales/en.json')).default,
  es: async () => (await import('./locales/es.json')).default,
  fr: async () => (await import('./locales/fr.json')).default,
  de: async () => (await import('./locales/de.json')).default,
};

function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: 'pt',
  translations: pt as Translations,

  setLocale: async (locale: string) => {
    const loader = LOCALES[locale];
    if (!loader) return;
    const translations = await loader();
    set({ locale, translations });
  },

  t: (key: string, params?: Record<string, string | number>) => {
    const value = getNestedValue(get().translations, key);
    if (!value) return key;
    if (!params) return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{{${k}}}`
    );
  },
}));
