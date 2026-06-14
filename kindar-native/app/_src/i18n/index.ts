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

/**
 * Idioma do dispositivo na 1ª execução (sem escolha salva). Usa o locale padrão
 * do Intl — no Hermes-com-Intl (iOS/Android) ele resolve do sistema, ex.:
 * "pt-BR", "en-US" — e reduz ao languageCode. Retorna o suportado ou 'pt'.
 * A escolha MANUAL (AsyncStorage) sempre prevalece sobre isto.
 * NOTA: validar no device que resolvedOptions().locale reflete o idioma do
 * aparelho (não um valor fixo) antes de confiar 100%.
 */
function detectDeviceLocale(): SupportedLocale {
  try {
    const tag = new Intl.DateTimeFormat().resolvedOptions().locale;
    const lang = tag.split('-')[0].toLowerCase();
    if (isSupported(lang)) return lang;
  } catch {
    // Intl indisponível → mantém pt.
  }
  return 'pt';
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

/* ------------------------------------------------------------------ */
/* ICU MessageFormat — plural/select (Regra Canônica 7)               */
/*                                                                    */
/* O `t()` nativo só fazia interpolação `{var}`/`{{var}}`. Strings com */
/* `{count, plural, one {…} other {…}}` (padrão ICU, igual ao PWA)     */
/* vazavam CRUAS pro user (bug do briefing "Sua Atenção", device do    */
/* dono 14/jun). Este renderer resolve plural/select ANTES da          */
/* interpolação simples. Blast radius contido: `hasICU()` só ativa     */
/* quando a sintaxe está presente — strings sem ICU seguem o caminho   */
/* antigo, byte-idêntico.                                              */
/* ------------------------------------------------------------------ */

/** Detecta `{arg, plural,` ou `{arg, select,` — gate p/ não tocar strings normais. */
function hasICU(value: string): boolean {
  return /\{\s*\w+\s*,\s*(plural|select)\s*,/.test(value);
}

/** Quebra o corpo de opções (`one {…} other {…}`) respeitando chaves aninhadas. */
function parseICUOptions(body: string): Record<string, string> {
  const options: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++; // skip ws
    let keyword = '';
    while (i < body.length && body[i] !== '{') {
      keyword += body[i];
      i++;
    }
    keyword = keyword.trim();
    if (body[i] !== '{') break;
    // lê o conteúdo da opção com brace-matching (pode ter {var} dentro)
    let depth = 0;
    let content = '';
    for (; i < body.length; i++) {
      const ch = body[i];
      if (ch === '{') {
        depth++;
        if (depth === 1) continue; // não inclui a chave de abertura externa
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      content += ch;
    }
    if (keyword) options[keyword] = content;
  }
  return options;
}

/** Seleciona a opção certa por plural (CLDR via Intl, com `=N` exato) ou select. */
function selectICUOption(
  options: Record<string, string>,
  kind: 'plural' | 'select',
  argValue: string | number | undefined,
  locale: string,
): string {
  if (kind === 'select') {
    return options[String(argValue)] ?? options.other ?? '';
  }
  const n = Number(argValue);
  if (options[`=${n}`] !== undefined) return options[`=${n}`];
  let category = n === 1 ? 'one' : 'other';
  try {
    category = new Intl.PluralRules(locale).select(n);
  } catch {
    // Intl.PluralRules indisponível → fallback one/other (cobre pt/en/es).
  }
  return options[category] ?? options.other ?? options.one ?? '';
}

/** Resolve TODOS os blocos plural/select da string (loop com guarda anti-runaway). */
function renderICU(input: string, params: Record<string, string | number>, locale: string): string {
  const re = /\{\s*(\w+)\s*,\s*(plural|select)\s*,/;
  let out = input;
  let guard = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out)) && guard++ < 50) {
    const start = m.index;
    const argName = m[1];
    const kind = m[2] as 'plural' | 'select';
    // acha a chave de fechamento do bloco (brace-matching a partir do `{`)
    let depth = 0;
    let end = -1;
    for (let i = start; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break; // malformado → não arrisca, sai
    const body = out.slice(start + m[0].length, end);
    const argValue = params[argName];
    let chosen = selectICUOption(parseICUOptions(body), kind, argValue, locale);
    if (kind === 'plural') {
      chosen = chosen.replace(/#/g, argValue !== undefined ? String(argValue) : '');
    }
    out = out.slice(0, start) + chosen + out.slice(end + 1);
  }
  return out;
}

/**
 * Pipeline puro de formatação (testável sem o store):
 *   1. ICU plural/select (só quando presente — gate hasICU)
 *   2. interpolação `{{var}}` (i18next legacy) e `{var}` (single brace)
 *
 * O dois passos de replace existem porque os JSON misturam estilos (bug Aline
 * 2026-05-13 iOS: `{var}` aparecia literal). O user nunca deve ver `{...}` cru.
 */
export function formatMessage(
  value: string,
  params: Record<string, string | number> | undefined,
  locale: string,
): string {
  if (!params) return value;
  if (hasICU(value)) value = renderICU(value, params, locale);
  return value
    .replace(/\{\{(\w+)\}\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{{${k}}}`))
    .replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
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
      // 1) Escolha manual salva SEMPRE prevalece (sobre detecção).
      if (isSupported(stored)) {
        if (stored !== get().locale) {
          const translations = await LOCALES[stored]();
          set({ locale: stored, translations, hydrated: true });
          return;
        }
        set({ hydrated: true });
        return;
      }
      // 2) 1ª execução (sem escolha salva): detecta o idioma do dispositivo.
      //    NÃO persiste — re-detecta a cada launch até o user escolher manualmente.
      const detected = detectDeviceLocale();
      if (detected !== get().locale) {
        const translations = await LOCALES[detected]();
        set({ locale: detected, translations, hydrated: true });
        return;
      }
    } catch {
      // Fall through and keep PT default.
    }
    set({ hydrated: true });
  },

  t: (key: string, params?: Record<string, string | number>) => {
    // Fallback seguro (i18n): chave ausente no locale ativo cai pro PT (source
    // locale) ANTES de mostrar a chave crua. Só em último caso (ausente até no
    // PT) devolve a key — e avisa em dev. Evita "namespace.key" vazando pro user.
    let value = getNestedValue(get().translations, key);
    if (value === undefined) value = getNestedValue(pt, key);
    if (value === undefined) {
      if (__DEV__) console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    return formatMessage(value, params, get().locale);
  },
}));
