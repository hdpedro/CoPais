"use client";

import { memo, useMemo, type FormEvent, type RefObject } from "react";
import type { ChildSex, Translate } from "../_lib/types";

type Kind = "first" | "another" | "edit";

interface Props {
  kind: Kind;
  name: string;
  birth: string;
  sex: ChildSex | "";
  loading: boolean;
  error: string | null;
  onName: (v: string) => void;
  onBirth: (v: string) => void;
  onSex: (v: ChildSex | "") => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  nameRef: RefObject<HTMLInputElement | null>;
  t: Translate;
}

const SEX_OPTIONS = [
  { v: "F" as const, labelKey: "onboardingForm.sexFemale", icon: "👧" },
  { v: "M" as const, labelKey: "onboardingForm.sexMale", icon: "👦" },
];

/** Form unificado pra cadastrar/editar criança (1ª, Nx ou edit). */
function ChildFormImpl({
  kind, name, birth, sex, loading, error,
  onName, onBirth, onSex, onSubmit, onBack, nameRef, t,
}: Props) {
  // Memoiza os strings pra evitar 3 calls de t() a cada render.
  const { title, subtitle, cta, heroEmoji } = useMemo(() => ({
    title: t(
      kind === "first" ? "onboardingForm.addFirstChild"
      : kind === "edit" ? "onboardingForm.editChildTitle"
      : "onboardingForm.addAnotherChild",
    ),
    subtitle: t(
      kind === "first" ? "onboardingForm.firstChildHelp"
      : kind === "edit" ? "onboardingForm.editChildHelp"
      : "onboardingForm.anotherChildHelp",
    ),
    cta: t(
      kind === "first" ? "onboardingForm.saveAndContinue"
      : kind === "edit" ? "onboardingForm.saveChanges"
      : "onboardingForm.addToFamily",
    ),
    heroEmoji: kind === "edit" ? "✏️" : kind === "first" ? "👶" : "✨",
  }), [kind, t]);

  // Hoje em ISO pra max= do input date — evita aceitar datas futuras no client.
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const canSubmit = !loading && name.trim().length > 0 && birth.length > 0;

  return (
    <form
      onSubmit={onSubmit}
      aria-busy={loading}
      className="animate-[fadeIn_280ms_ease-out] bg-white rounded-xl p-6 shadow-sm space-y-4"
    >
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-muted hover:text-dark flex items-center gap-1 -ml-1"
        aria-label={t("common.back")}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t("common.back")}
      </button>

      <div className="text-center">
        <div className="text-4xl mb-3" aria-hidden="true">{heroEmoji}</div>
        <h2 className="text-xl font-bold text-dark">{title}</h2>
        <p className="text-muted text-sm mt-1">{subtitle}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm" role="alert">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="child-name" className="block text-sm font-medium text-dark mb-1">
          {t("onboardingForm.childFullName")}
        </label>
        <input
          ref={nameRef}
          id="child-name"
          type="text"
          required
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={t("onboardingForm.childNamePlaceholder")}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>

      <div>
        <label htmlFor="child-birth" className="block text-sm font-medium text-dark mb-1">
          {t("onboardingForm.birthDate")}
        </label>
        <input
          id="child-birth"
          type="date"
          required
          value={birth}
          onChange={(e) => onBirth(e.target.value)}
          max={todayIso}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-dark mb-1">
          {t("onboardingForm.sexOptional")}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {SEX_OPTIONS.map((opt) => {
            const active = sex === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => onSex(active ? "" : opt.v)}
                aria-pressed={active}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 border-primary text-dark"
                    : "bg-white border-gray-200 text-muted hover:text-dark"
                }`}
              >
                <span className="text-xl" aria-hidden="true">{opt.icon}</span>
                {t(opt.labelKey)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? t("onboardingForm.creating") : cta}
      </button>
    </form>
  );
}

export const ChildForm = memo(ChildFormImpl);
