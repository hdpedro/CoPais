"use client";

import { useI18n } from "@/i18n/provider";
import { createInvitation } from "@/actions/invitation";
import Link from "next/link";
import InviteShareCard from "./InviteShareCard";

interface ConviteClientProps {
  groupId: string;
  groupName: string;
  inviteSuccess: boolean;
  inviteLink: string | null;
  errorParam: string | null;
}

export default function ConviteClient({
  groupId,
  groupName,
  inviteSuccess,
  inviteLink,
  errorParam,
}: ConviteClientProps) {
  const { t } = useI18n();

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Progress indicator — harmonizado com OnboardingForm wizard (3 etapas:
          Família · Crianças · Convite). 3ª dot ativa (expandida). */}
      <div
        className="flex items-center justify-center gap-2 mb-8"
        role="progressbar"
        aria-valuenow={3}
        aria-valuemin={1}
        aria-valuemax={3}
        aria-label="Etapa 3 de 3"
      >
        <span className="h-1 w-6 rounded-full bg-primary" />
        <span className="h-1 w-6 rounded-full bg-primary" />
        <span className="h-1 w-8 rounded-full bg-primary" />
      </div>

      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-dark">{t("onboarding.groupCreated")}</h1>
        <p className="text-muted mt-2">
          <span className="font-semibold text-dark">{groupName}</span> {t("onboarding.isReady")}
        </p>
      </div>

      {/* If invite already sent, show share card */}
      {inviteSuccess && inviteLink ? (
        <InviteShareCard inviteLink={inviteLink} groupName={groupName} />
      ) : (
        <>
          {/* Invite form */}
          <form action={createInvitation} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="returnTo" value="/onboarding/convite" />

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-secondary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-dark">{t("onboarding.inviteParent")}</h3>
                <p className="text-xs text-muted">{t("onboarding.inviteDescription")}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("onboarding.otherParentEmail")}</label>
              <input
                type="email"
                name="email"
                required
                placeholder="email@exemplo.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("onboarding.role")}</label>
              <select
                name="role"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                <option value="parent">{t("onboarding.roleParent")}</option>
                <option value="grandparent">{t("onboarding.roleGrandparent")}</option>
                <option value="caregiver">{t("onboarding.roleCaregiver")}</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors"
            >
              {t("onboarding.generateInviteLink")}
            </button>
          </form>

          {errorParam && (
            <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mt-4 text-sm text-center">
              {decodeURIComponent(errorParam)}
            </div>
          )}
        </>
      )}

      {/* Skip button */}
      <div className="text-center mt-6">
        <Link
          href="/dashboard"
          className="text-sm text-muted hover:text-dark transition-colors"
        >
          {inviteSuccess ? t("onboarding.goToDashboard") : t("onboarding.skipForNow")}
        </Link>
      </div>
    </div>
  );
}
