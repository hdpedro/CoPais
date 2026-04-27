/**
 * i18n — Kindar Native
 *
 * Lightweight i18n driven by the same JSON locale files as the web app.
 * Adoption parity with PWA: every screen should `useI18n()` and call
 * `t('namespace.key')` instead of hardcoding pt-BR strings.
 *
 * Persistence: locale choice is stored in AsyncStorage (`@kindar_locale`)
 * and hydrated on app start by `hydrateLocale()`. Without this, the
 * picker in Perfil reverts to "pt" on every relaunch.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import pt from './locales/pt.json';

type Translations = Record<string, unknown>;

const STORAGE_KEY = '@kindar_locale';
const SUPPORTED = ['pt', 'en', 'es', 'fr', 'de'] as const;
type SupportedLocale = (typeof SUPPORTED)[number];

interface I18nState {
  locale: SupportedLocale;
  translations: Translations;
  hydrated: boolean;
  setLocale: (locale: string) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  hydrate: () => Promise<void>;
}

const LOCALES: Record<SupportedLocale, () => Promise<Translations>> = {
  pt: async () => pt,
  en: async () => (await import('./locales/en.json')).default,
  es: async () => (await import('./locales/es.json')).default,
  fr: async () => (await import('./locales/fr.json')).default,
  de: async () => (await import('./locales/de.json')).default,
};

function isSupported(value: string | null | undefined): value is SupportedLocale {
  return !!value && (SUPPORTED as readonly string[]).includes(value);
}

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
  hydrated: false,

  setLocale: async (locale: string) => {
    if (!isSupported(locale)) return;
    const loader = LOCALES[locale];
    if (!loader) return;
    const translations = await loader();
    set({ locale, translations });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Non-fatal — the new locale still applies for this session.
    }
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (isSupported(stored) && stored !== get().locale) {
        const translations = await LOCALES[stored]();
        set({ locale: stored, translations, hydrated: true });
        return;
      }
    } catch {
      // Fall through and keep PT default.
    }
    set({ hydrated: true });
  },

  t: (key: string, params?: Record<string, string | number>) => {
    const value = getNestedValue(get().translations, key);
    if (!value) return key;
    if (!params) return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{{${k}}}`,
    );
  },
}));
