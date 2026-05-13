"use client";

import { memo, type FormEvent } from "react";
import type { InviteRole, Translate } from "../_lib/types";

interface Props {
  email: string;
  role: InviteRole;
  sending: boolean;
  error: string | null;
  onEmail: (v: string) => void;
  onRole: (v: InviteRole) => void;
  onSend: () => void;
  t: Translate;
}

const ROLE_OPTIONS: { value: InviteRole; key: string; icon: string }[] = [
  { value: "parent", key: "roleParent", icon: "👨‍👩‍👧" },
  { value: "grandparent", key: "roleGrandparent", icon: "👴" },
  { value: "caregiver", key: "roleCaregiver", icon: "🧑‍🍼" },
];

/** Form inline de convite (single-screen no resumo da família). */
function InviteFormImpl({ email, role, sending, error, onEmail, onRole, onSend, t }: Props) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSend();
  }

  const canSend = !sending && email.trim().length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={sending}
      className="bg-white rounded-xl p-4 shadow-sm space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-xl flex-shrink-0" aria-hidden="true">
          🤝
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-dark">{t("onboardingForm.inviteCoparentTitle")}</h3>
            <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {t("onboardingForm.recommended")}
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">{t("onboardingForm.inviteCoparentSubtitle")}</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm" role="alert">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="invite-email" className="block text-xs font-medium text-dark mb-1">
          {t("onboarding.otherParentEmail")}
        </label>
        <input
          id="invite-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="email@exemplo.com"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>

      <fieldset>
        <legend className="block text-xs font-medium text-dark mb-1">
          {t("onboarding.role")}
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {ROLE_OPTIONS.map((opt) => {
            const active = role === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onRole(opt.value)}
                aria-pressed={active}
                className={`flex items-center justify-center gap-1 py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary/10 border-primary text-dark"
                    : "bg-white border-gray-200 text-muted hover:text-dark"
                }`}
              >
                <span className="text-base" aria-hidden="true">{opt.icon}</span>
                {t(`onboarding.${opt.key}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={!canSend}
        className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? t("onboardingForm.inviteSending") : t("onboardingForm.sendInviteNow")}
      </button>
    </form>
  );
}

export const InviteForm = memo(InviteFormImpl);
