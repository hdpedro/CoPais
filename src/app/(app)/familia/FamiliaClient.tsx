"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { PARENT_COLORS, getDisplayName } from "@/lib/constants";
import MemberActions from "./MemberActions";
import LeaveGroupButton from "./LeaveGroupButton";

interface SerializedMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  full_name: string | null;
  email: string | null;
}

interface SerializedChild {
  id: string;
  full_name: string;
  birth_date: string;
}

interface SerializedInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  accepted_name: string | null;
}

interface FamiliaClientProps {
  groupId: string;
  groupName: string;
  createdBy: string | null;
  isAdmin: boolean;
  isOnlyAdmin: boolean;
  currentUserId: string;
  members: SerializedMember[];
  children: SerializedChild[];
  pendingInvites: SerializedInvite[];
  acceptedInvites: SerializedInvite[];
  appUrl: string;
  successMessage?: string;
  errorMessage?: string;
  cancelInviteAction: (formData: FormData) => Promise<void>;
}

export default function FamiliaClient({
  groupId,
  groupName,
  createdBy,
  isAdmin,
  isOnlyAdmin,
  currentUserId,
  members,
  children,
  pendingInvites,
  acceptedInvites,
  // appUrl is part of the interface for forward compat; not yet consumed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  appUrl,
  successMessage,
  errorMessage,
  cancelInviteAction,
}: FamiliaClientProps) {
  const { t } = useI18n();
  // Capture `now` at mount so age/expiry math is pure during render
  // (react-hooks/purity). Stale-by-a-day is acceptable on this screen.
  const [now] = useState(() => Date.now());

  const roleLabels: Record<string, string> = {
    admin: t("familyPage.roleAdmin"),
    member: t("familyPage.roleMember"),
    readonly: t("familyPage.roleReadonly"),
  };

  const roleDescriptions: Record<string, string> = {
    admin: t("familyPage.roleAdminDesc"),
    member: t("familyPage.roleMemberDesc"),
    readonly: t("familyPage.roleReadonlyDesc"),
  };

  const roleColors: Record<string, string> = {
    admin: "bg-primary/10 text-primary",
    member: "bg-accent/10 text-accent",
    readonly: "bg-muted/10 text-muted",
  };

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">{groupName}</h1>
          <p className="text-sm text-muted">{t("familyPage.manageFamily")}</p>
        </div>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="bg-success/10 border border-success/20 text-success rounded-lg p-3 mb-4 text-sm">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Members Section */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t("family.members")} ({members?.length || 0})
        </h2>

        <div className="space-y-3">
          {members?.map((member, index) => {
            const isMe = member.user_id === currentUserId;
            const isOwner = member.user_id === createdBy;
            const color = index === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary;
            const joinDate = new Date(member.joined_at);

            return (
              <div key={member.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {getDisplayName(member.full_name)?.[0] || "?"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-dark text-sm truncate">
                        {getDisplayName(member.full_name)}
                      </p>
                      {isMe && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-medium">{t("familyPage.you")}</span>
                      )}
                      {isOwner && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded-full font-medium">{t("familyPage.creator")}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted truncate">{member.email}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${roleColors[member.role] || "bg-gray-100 text-gray-600"}`}>
                        {roleLabels[member.role] || member.role}
                      </span>
                      <span className="text-[10px] text-muted">
                        {t("familyPage.since")} {joinDate.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                      </span>
                    </div>
                  </div>

                  {/* Actions (only admin can manage, not self) */}
                  {isAdmin && !isMe && (
                    <MemberActions
                      memberId={member.user_id}
                      groupId={groupId}
                      currentRole={member.role}
                      memberName={getDisplayName(member.full_name, true)}
                    />
                  )}
                </div>

                {/* Role description */}
                <p className="text-[11px] text-muted mt-2 pl-14">
                  {roleDescriptions[member.role]}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Children Section */}
      {children && children.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
            <span className="text-sm">👶</span>
            {t("family.children")} ({children.length})
          </h2>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="space-y-2">
              {children.map((child) => {
                const age = Math.floor(
                  (now - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
                );
                return (
                  <div key={child.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">👶</span>
                      <div>
                        <p className="text-sm font-medium text-dark">{child.full_name}</p>
                        <p className="text-[11px] text-muted">{age} {age === 1 ? t("dashboard.yearOld") : t("dashboard.yearsOld")}</p>
                      </div>
                    </div>
                    <Link href={`/criancas/${child.id}`} className="text-xs text-primary font-medium">
                      {t("familyPage.view")}
                    </Link>
                  </div>
                );
              })}
            </div>
            <Link
              href="/criancas/nova"
              className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 text-sm text-primary font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t("family.addChild")}
            </Link>
          </div>
        </section>
      )}

      {/* Pending Invitations */}
      {pendingInvites && pendingInvites.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {t("familyPage.pendingInvites")} ({pendingInvites.length})
          </h2>
          <div className="space-y-2">
            {pendingInvites.map((invite) => {
              const expires = new Date(invite.expires_at);
              const isExpired = expires.getTime() < now;
              const daysLeft = Math.ceil((expires.getTime() - now) / (1000 * 60 * 60 * 24));

              return (
                <div key={invite.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-dark">{invite.email}</p>
                      <p className="text-[11px] text-muted">
                        {invite.role === "parent" ? t("family.parent") : invite.role}
                        {" — "}
                        {isExpired ? (
                          <span className="text-error">{t("familyPage.expired")}</span>
                        ) : (
                          <span>{t("familyPage.expiresIn", { days: daysLeft, unit: daysLeft === 1 ? t("calendar.day") : t("calendar.days") })}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!isExpired && (
                      <Link
                        href={`/convite/enviar?success=true&token=${invite.token}`}
                        className="text-xs text-primary font-medium px-3 py-1.5 bg-primary/5 rounded-lg hover:bg-primary/10"
                      >
                        {t("familyPage.share")}
                      </Link>
                    )}
                    {isAdmin && (
                      <form action={cancelInviteAction}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <button
                          type="submit"
                          className="text-xs text-error font-medium px-3 py-1.5 bg-error/5 rounded-lg hover:bg-error/10"
                        >
                          {t("common.cancel")}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* History */}
      {acceptedInvites && acceptedInvites.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t("familyPage.history")}
          </h2>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="space-y-3">
              {acceptedInvites.map((invite) => {
                const date = new Date(invite.accepted_at || invite.created_at);
                return (
                  <div key={invite.id} className="flex items-start gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      invite.status === "accepted" ? "bg-success" : "bg-error"
                    }`} />
                    <div>
                      <p className="text-dark">
                        {invite.status === "accepted" ? (
                          <><span className="font-medium">{invite.accepted_name || invite.email}</span> {t("familyPage.joinedGroup")}</>
                        ) : (
                          <>{t("familyPage.inviteTo")} <span className="font-medium">{invite.email}</span> {t("familyPage.wasCancelled")}</>
                        )}
                      </p>
                      <p className="text-muted">
                        {date.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Invite button */}
      {isAdmin && (
        <Link
          href="/convite/enviar"
          className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors mb-3"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          {t("familyPage.inviteNewMember")}
        </Link>
      )}

      {/* Leave group button */}
      <LeaveGroupButton groupId={groupId} isOnlyAdmin={isOnlyAdmin} />
    </div>
  );
}
