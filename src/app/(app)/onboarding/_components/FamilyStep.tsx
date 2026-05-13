"use client";

import { memo } from "react";
import type { Translate } from "../_lib/types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  t: Translate;
}

/** Etapa 1: nome da família + CTA continuar. */
function FamilyStepImpl({ value, onChange, onContinue, t }: Props) {
  const canContinue = value.trim().length > 0;
  return (
    <div className="animate-[fadeIn_280ms_ease-out] bg-white rounded-xl p-6 shadow-sm space-y-4">
      <div className="text-center mb-2">
        <div className="text-4xl mb-3" aria-hidden="true">🏠</div>
        <h1 className="text-2xl font-bold text-dark">{t("onboarding.welcome")}</h1>
        <p className="text-muted mt-1 text-sm">{t("onboardingForm.setupSubtitle")}</p>
      </div>

      <div>
        <label htmlFor="family-name" className="block text-sm font-medium text-dark mb-1">
          {t("onboardingForm.familyName")}
        </label>
        <input
          id="family-name"
          type="text"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canContinue) {
              e.preventDefault();
              onContinue();
            }
          }}
          autoFocus
          placeholder={t("onboardingForm.familyNamePlaceholder")}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("onboardingForm.continue")}
      </button>
    </div>
  );
}

export const FamilyStep = memo(FamilyStepImpl);
