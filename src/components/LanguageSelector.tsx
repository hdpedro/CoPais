"use client";

import { useI18n } from "@/i18n/provider";
import { SUPPORTED_LOCALES, LOCALE_NAMES, LOCALE_FLAGS, type Locale } from "@/i18n";

export default function LanguageSelector() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
              <svg className="w-4 h-4 ml-auto text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
