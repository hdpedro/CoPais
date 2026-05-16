"use client";

import { useI18n } from "@/i18n/provider";
import { SUPPORTED_LOCALES, LOCALE_NAMES, LOCALE_FLAGS, type Locale } from "@/i18n";

/**
 * Language selector.
 *
 * Feature flag: NEXT_PUBLIC_ENABLE_LOCALE_SWITCH
 *
 *   - "1" / "true" → render full selector (5 locales, switchable).
 *   - anything else / unset → render the "em manutenção" notice instead, so
 *     non-pt users see a clear status while we finish the migration of the
 *     remaining ~30 server pages still hardcoding pt strings (see PLANO_
 *     I18N_EXECUCAO.md). Server already detects/respects the cookie, but
 *     auxiliary pages still bake pt; showing the picker would mislead.
 *
 * Once the cleanup PR lands (and visual regression in 5 locales passes), set
 * the flag to "1" in Vercel + ship. Users who chose a locale via Accept-
 * Language middleware on first visit already get the correct cookie — flag
 * controls visibility of the *manual override* UI, not the underlying i18n
 * pipeline.
 */
function isLocaleSwitchEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_ENABLE_LOCALE_SWITCH;
  return flag === "1" || flag === "true";
}

export default function LanguageSelector() {
  const { locale, setLocale } = useI18n();
  const enabled = isLocaleSwitchEnabled();

  if (!enabled) {
    // Fase 0 — stop the bleeding. Visible only on /perfil; users see what's
    // happening instead of a partial-translation UX. Copy itself is bilingual
    // pt/en because the user reading this might already have a non-pt locale
    // detected by middleware.
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#B45309"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
          </svg>
          <h3 className="font-semibold text-amber-900 text-sm">
            Idioma / Language
          </h3>
        </div>
        <p className="text-sm text-amber-900 leading-relaxed">
          Estamos finalizando o suporte completo a inglês, espanhol, francês e
          alemão. Em breve você poderá trocar o idioma por aqui.
        </p>
        <p className="text-xs text-amber-800 mt-2 leading-relaxed">
          We are finishing full support for English, Spanish, French and German.
          You will be able to switch language here soon.
        </p>
        <p className="text-[11px] text-amber-700 mt-3">
          Idioma atual / Current language:{" "}
          <span className="font-medium">
            {LOCALE_FLAGS[locale]} {LOCALE_NAMES[locale]}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
        <h3 className="font-semibold text-dark text-sm">Idioma / Language</h3>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {SUPPORTED_LOCALES.map((loc) => (
          <button
            key={loc}
            onClick={() => setLocale(loc as Locale)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              locale === loc
                ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span className="text-lg">{LOCALE_FLAGS[loc as Locale]}</span>
            <span>{LOCALE_NAMES[loc as Locale]}</span>
            {locale === loc && (
              <svg className="w-4 h-4 ml-auto text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
