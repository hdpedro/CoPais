"use client";

import { memo, type RefObject } from "react";
import type { InviteRole, InviteSentInfo, Translate, WizardChild } from "../_lib/types";
import { ChildCard } from "./ChildCard";
import { InviteForm } from "./InviteForm";
import { InviteSentCard } from "./InviteSentCard";

interface Props {
  groupName: string;
  kids: WizardChild[];
  /** Ref do heading principal pra screen reader focus após transição. */
  headingRef: RefObject<HTMLHeadingElement | null>;

  /** Erro global do resumo (delete falhou, etc.) — anunciado via aria-live. */
  summaryError: string | null;
  onDismissSummaryError: () => void;

  onAddAnother: () => void;
  onEdit: (id: string) => void;

  pendingDeleteId: string | null;
  onRequestDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;

  inviteEmail: string;
  inviteRole: InviteRole;
  inviteSending: boolean;
  inviteError: string | null;
  inviteSent: InviteSentInfo | null;
  onInviteEmail: (v: string) => void;
  onInviteRole: (v: InviteRole) => void;
  onSendInvite: () => void;
  onSendAnother: () => void;

  onFinish: () => void;
  t: Translate;
}

const INVITE_SECTION_ID = "onboarding-invite-section";

/** Resumo da família — celebração + lista + convite inline + CTA final. */
function FamilySummaryImpl({
  groupName, kids,
  headingRef, summaryError, onDismissSummaryError,
  onAddAnother, onEdit,
  pendingDeleteId, onRequestDelete, onConfirmDelete, onCancelDelete,
  inviteEmail, inviteRole, inviteSending, inviteError, inviteSent,
  onInviteEmail, onInviteRole, onSendInvite, onSendAnother,
  onFinish, t,
}: Props) {
  const count = kids.length;
  const countLabel =
    count === 0 ? t("onboardingForm.familyReady") :
    count === 1 ? t("onboardingForm.familyHasOne") :
    t("onboardingForm.familyHasMany", { count });

  return (
    <div className="animate-[fadeIn_280ms_ease-out] space-y-5">
      {/* Skip link — visível só ao focar com teclado, leva direto pro form
          de convite (evita tabular por edit/remove de cada criança). */}
      <a
        href={`#${INVITE_SECTION_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:px-3 focus:py-1.5 focus:bg-primary focus:text-white focus:rounded-md focus:text-sm focus:font-semibold focus:shadow"
      >
        {t("onboardingForm.skipToInvite")}
      </a>

      {/* Celebração — checkmark + sparkles + título */}
      <div className="text-center">
        <div className="relative inline-flex items-center justify-center mb-3">
          <span className="absolute -top-2 -left-8 text-base animate-[sparkle_700ms_ease-out_200ms_both]" aria-hidden="true">✨</span>
          <span className="absolute -top-1 -right-8 text-sm animate-[sparkle_700ms_ease-out_320ms_both]" aria-hidden="true">✨</span>
          <span className="absolute bottom-0 -left-3 text-xs animate-[sparkle_700ms_ease-out_440ms_both]" aria-hidden="true">✨</span>
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center animate-[heroPop_520ms_ease-out_80ms_both]" aria-hidden="true">
            <svg className="w-10 h-10 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h2
          ref={headingRef}
          // tabIndex={-1} permite focus programático sem entrar na tab order.
          tabIndex={-1}
          className="text-2xl font-bold text-dark outline-none"
        >
          {groupName || t("onboardingForm.familyCreated")}
        </h2>
        <p className="text-muted text-sm mt-1" aria-live="polite" role="status">
          {countLabel}
        </p>
      </div>

      {/* Live region pra erros globais do resumo (delete falhou). */}
      {summaryError && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-start gap-2"
        >
          <span className="flex-1">{summaryError}</span>
          <button
            type="button"
            onClick={onDismissSummaryError}
            aria-label={t("common.close")}
            className="text-red-700 hover:text-red-900 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Cards das crianças */}
      <ul className="space-y-2" aria-label={t("onboardingForm.childrenList")}>
        {kids.map((kid, i) => (
          <ChildCard
            key={kid.id}
            kid={kid}
            index={i}
            isPendingDelete={pendingDeleteId === kid.id}
            onEdit={onEdit}
            onRequestDelete={onRequestDelete}
            onConfirmDelete={onConfirmDelete}
            onCancelDelete={onCancelDelete}
            t={t}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={onAddAnother}
        className="w-full py-4 bg-white border-2 border-dashed border-primary text-primary font-semibold rounded-xl hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {t("onboardingForm.addAnotherChild")}
      </button>

      <section id={INVITE_SECTION_ID} aria-label={t("onboardingForm.inviteCoparentTitle")}>
        {inviteSent ? (
          <InviteSentCard
            email={inviteSent.email}
            token={inviteSent.token}
            onAnother={onSendAnother}
            t={t}
          />
        ) : (
          <InviteForm
            email={inviteEmail}
            role={inviteRole}
            sending={inviteSending}
            error={inviteError}
            onEmail={onInviteEmail}
            onRole={onInviteRole}
            onSend={onSendInvite}
            t={t}
          />
        )}
      </section>

      <button
        type="button"
        onClick={onFinish}
        className={`w-full py-2 transition-colors text-sm ${
          inviteSent
            ? "text-primary font-semibold hover:opacity-80"
            : "text-muted hover:text-dark"
        }`}
      >
        {inviteSent ? t("onboardingForm.finishOnboarding") : t("onboardingForm.goToAppInviteLater")}
      </button>
    </div>
  );
}

export const FamilySummary = memo(FamilySummaryImpl);
