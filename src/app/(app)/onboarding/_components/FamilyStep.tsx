"use client";

import { memo } from "react";
import type { Translate } from "../_lib/types";
import type { OnboardingArrangement } from "../_lib/wizard-state";

interface Props {
  value: string;
  onChange: (v: string) => void;
  arrangement: OnboardingArrangement;
  onArrangement: (a: OnboardingArrangement) => void;
  onContinue: () => void;
  t: Translate;
}

const FAMILY_FORMS: { key: OnboardingArrangement; icon: string; labelKey: string }[] = [
  { key: "rotating", icon: "🔄", labelKey: "onboardingForm.familyFormRotating" },
  { key: "together", icon: "🏠", labelKey: "onboardingForm.familyFormTogether" },
  { key: "single", icon: "👤", labelKey: "onboardingForm.familyFormSingle" },
];

/** Etapa 1: nome da família + forma da guarda + CTA continuar. */
function FamilyStepImpl({ value, onChange, arrangement, onArrangement, onContinue, t }: Props) {
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

      <div>
        <p className="block text-sm font-medium text-dark mb-2">{t("onboardingForm.familyFormTitle")}</p>
        <div className="space-y-1.5">
          {FAMILY_FORMS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onArrangement(o.key)}
              aria-pressed={arrangement === o.key}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-2 text-left text-sm transition-colors ${
                arrangement === o.key
                  ? "border-primary bg-primary/5 text-dark font-medium"
                  : "border-gray-200 text-muted hover:border-gray-300"
              }`}
            >
              <span className="text-base flex-shrink-0" aria-hidden="true">{o.icon}</span>
              <span className="flex-1">{t(o.labelKey)}</span>
              {arrangement === o.key && <span className="text-primary" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-2">{t("onboardingForm.familyFormHint")}</p>
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
