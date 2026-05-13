"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { createInvitation } from "@/actions/invitation";
import { deleteInvitation } from "@/actions/members";
import Link from "next/link";
import InviteShareCard from "../../onboarding/convite/InviteShareCard";

interface Invite {
  id: string;
  email: string;
  role: string;
  token: string;
  created_at: string;
  expires_at: string;
  status: string;
}

interface InviteClientProps {
  isAdminDenied: boolean;
  groupId: string;
  groupName: string;
  allInvites: Invite[];
  inviteToken: string | undefined;
  inviteSuccess: boolean;
  inviteDeleted: boolean;
  inviteLink: string | null;
  error: string | undefined;
}

export default function InviteClient({
  isAdminDenied,
  groupId,
  groupName,
  allInvites,
  // inviteToken is part of the interface for forward compat; not yet
  // consumed in this component.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  inviteToken,
  inviteSuccess,
  inviteDeleted,
  inviteLink,
  error,
}: InviteClientProps) {
  const { t } = useI18n();
  // Capture `now` at mount so expiry math is pure during render
  // (react-hooks/purity).
  const [now] = useState(() => Date.now());

  if (isAdminDenied) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <p className="text-muted">{t("invite.adminOnly")}</p>
        <Link href="/dashboard" className="text-primary font-medium mt-2 inline-block">{t("common.back")}</Link>
      </div>
    );
  }

  const roleLabels: Record<string, string> = {
    parent: t("invite.roleParent"),
    grandparent: t("invite.roleGrandparent"),
    caregiver: t("invite.roleCaregiver"),
    mediator: t("invite.roleMediator"),
    lawyer: t("invite.roleLawyer"),
    admin: t("invite.roleAdmin"),
    member: t("invite.roleMember"),
    readonly: t("invite.roleReadonly"),
  };

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">{t("invite.title")}</h1>
      </div>

      {inviteDeleted && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm text-center">
          {t("invite.deletedSuccess")}
        </div>
      )}

      {/* Show share card if invite was just created */}
      {inviteSuccess && inviteLink ? (
        <div className="space-y-4">
          <InviteShareCard inviteLink={inviteLink} groupName={groupName} />
          <div className="text-center">
            <Link href="/convite/enviar" className="text-sm text-primary font-medium hover:underline">
              {t("invite.sendAnother")}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm text-center">
              {decodeURIComponent(error)}
            </div>
          )}

          <form action={createInvitation} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="returnTo" value="/convite/enviar" />

            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("invite.emailLabel")}</label>
              <input type="email" name="email" required placeholder="email@exemplo.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("invite.roleLabel")}</label>
              <select name="role"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary">
                <option value="parent">{t("invite.roleParent")}</option>
                <option value="grandparent">{t("invite.roleGrandparent")}</option>
                <option value="caregiver">{t("invite.roleCaregiver")}</option>
                <option value="mediator">{t("invite.roleMediator")}</option>
                <option value="lawyer">{t("invite.roleLawyer")}</option>
              </select>
            </div>

            <button type="submit"
              className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
              {t("invite.generateLink")}
            </button>
          </form>
        </>
      )}

      {/* Show invitations list */}
      {allInvites && allInvites.length > 0 && !inviteSuccess && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-dark mb-3 px-1">{t("invite.sentInvites")}</h3>
          <div className="space-y-2">
            {allInvites.map((inv) => {
              const expires = new Date(inv.expires_at);
              const isExpired = inv.status === "pending" && expires < new Date();
              const isAccepted = inv.status === "accepted";
              const isPending = inv.status === "pending" && !isExpired;

              return (
                <div key={inv.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-dark text-sm truncate">{inv.email}</p>
                        {isAccepted && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            {t("invite.accepted")}
                          </span>
                        )}
                        {isPending && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            {t("invite.pending")}
                          </span>
                        )}
                        {isExpired && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                            {t("invite.expired")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {roleLabels[inv.role] || inv.role}
                        {isPending && (
                          <span> — {t("invite.expiresIn", { days: String(Math.ceil((expires.getTime() - now) / (1000 * 60 * 60 * 24))) })}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isPending && (
                        <Link
                          href={`/convite/enviar?success=true&token=${inv.token}`}
                          className="text-xs text-primary font-medium px-3 py-1 bg-primary/5 rounded-lg hover:bg-primary/10"
                        >
                          {t("invite.share")}
                        </Link>
                      )}
                      {!isAccepted && (
                        <form action={deleteInvitation}>
                          <input type="hidden" name="invitationId" value={inv.id} />
                          <input type="hidden" name="returnTo" value="/convite/enviar" />
                          <button
                            type="submit"
                            className="text-xs text-red-500 font-medium px-3 py-1 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                            title={t("common.delete")}
                          >
                            {t("common.delete")}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
