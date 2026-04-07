"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import EditProfileForm from "./EditProfileForm";
import WhatsAppLinkSection from "./WhatsAppLinkSection";
import LanguageSelector from "@/components/LanguageSelector";
import { signOut } from "@/actions/auth";

interface Membership {
  group_id: string;
  role: string;
  groupName: string;
}

export default function ProfileContent({
  displayName,
  email,
  phone,
  roleName,
  createdAt,
  currentName,
  memberships,
  whatsappStatus,
  whatsappPhone,
}: {
  displayName: string;
  email: string;
  phone?: string;
  roleName: string;
  createdAt: string;
  currentName: string;
  memberships: Membership[];
  whatsappStatus: "unlinked" | "pending" | "linked";
  whatsappPhone?: string;
}) {
  const { t } = useI18n();

  const roleLabels: Record<string, string> = {
    admin: t("nav.admin"),
    member: t("nav.member"),
    parent: t("nav.member"),
    grandparent: t("nav.member"),
    caregiver: t("nav.member"),
    mediator: t("nav.member"),
    lawyer: t("nav.member"),
    viewer: t("nav.member"),
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-20">
      <h1 className="text-2xl font-bold text-dark">{t("nav.profile")}</h1>

      {/* Profile Card */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">
              {displayName?.[0]?.toUpperCase() || "?"}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-dark">{displayName}</h2>
            <p className="text-sm text-muted">{email}</p>
            <p className="text-xs text-primary mt-1">{roleLabels[roleName] || roleName}</p>
          </div>
        </div>

        {phone && (
          <div className="py-2 border-t border-gray-100">
            <p className="text-xs text-muted">{t("profile.phone")}</p>
            <p className="text-sm text-dark">{phone}</p>
          </div>
        )}

        <div className="py-2 border-t border-gray-100">
          <p className="text-xs text-muted">{t("profile.memberSince")}</p>
          <p className="text-sm text-dark">{createdAt}</p>
        </div>

        {/* Edit Name */}
        <div className="pt-3 border-t border-gray-100">
          <EditProfileForm currentName={currentName} />
        </div>
      </div>

      {/* Groups */}
      {memberships.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-dark mb-3">{t("nav.myGroups")}</h3>
          <div className="space-y-2">
            {memberships.map((m) => (
              <div key={m.group_id} className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-medium text-dark">{m.groupName}</p>
                  <p className="text-xs text-muted">{roleLabels[m.role] || m.role}</p>
                </div>
                {m.role === "admin" && (
                  <Link href="/convite/enviar" className="text-xs text-primary font-medium">
                    {t("nav.inviteGuardian")}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp */}
      <WhatsAppLinkSection initialStatus={whatsappStatus} initialPhone={whatsappPhone} />

      {/* Language Selector */}
      <LanguageSelector />

      {/* Quick Links */}
      <div className="space-y-2">
        <Link href="/criancas" className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-dark">{t("nav.manageChildren")}</span>
            <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
        <Link href="/documentos" className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-dark">{t("nav.documents")}</span>
            <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>

      {/* Sign Out */}
      <form action={signOut}>
        <button type="submit"
          className="w-full py-3 bg-error/10 text-error font-semibold rounded-lg hover:bg-error/20 transition-colors">
          {t("auth.logout")}
        </button>
      </form>
    </div>
  );
}
