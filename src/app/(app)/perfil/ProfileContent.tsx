"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import EditProfileForm from "./EditProfileForm";
import WhatsAppLinkSection from "./WhatsAppLinkSection";
import LanguageSelector from "@/components/LanguageSelector";
import ReferralCard from "@/components/referral/ReferralCard";
import { signOut } from "@/actions/auth";

interface Membership {
  group_id: string;
  role: string;
  groupName: string;
}

interface ReferralProps {
  code: string;
  totalClicks: number;
  totalSignups: number;
  totalRewards: number;
  monthsEarned: number;
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
  referral,
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
  referral?: ReferralProps | null;
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
  // F#46: o role do user no APP (parent/grandparent/caregiver) é
  // diferente do role NO GRUPO (admin/member). Mostrar "Membro" embaixo
  // do email confundia user que era admin do grupo. Solução: só mostrar
  // tag quando role for não-default (mediator, lawyer, viewer — papéis
  // que importam pro contexto colaborativo). Pais/avós/cuidadores são
  // implícitos pelo grupo.
  const SHOW_USER_ROLE_TAG: Record<string, boolean> = {
    mediator: true,
    lawyer: true,
    viewer: true,
  };
  const showUserRoleTag = SHOW_USER_ROLE_TAG[roleName] === true;

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-20">
      <h1 className="text-2xl font-bold text-[#0E0C0A]">{t("nav.profile")}</h1>

      {/* Profile Card */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-[#C07055]/10 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-[#C07055]">
              {displayName?.[0]?.toUpperCase() || "?"}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0E0C0A]">{displayName}</h2>
            <p className="text-sm text-[#9A8878]">{email}</p>
            {showUserRoleTag && (
              <p className="text-xs text-[#C07055] font-medium mt-1">{roleLabels[roleName] || roleName}</p>
            )}
          </div>
        </div>

        {phone && (
          <div className="py-2 border-t border-[#F0E8DA]">
            <p className="text-xs text-[#9A8878]">{t("profile.phone")}</p>
            <p className="text-sm text-[#0E0C0A]">{phone}</p>
          </div>
        )}

        <div className="py-2 border-t border-[#F0E8DA]">
          <p className="text-xs text-[#9A8878]">{t("profile.memberSince")}</p>
          <p className="text-sm text-[#0E0C0A]">{createdAt}</p>
        </div>

        {/* Edit Name */}
        <div className="pt-3 border-t border-[#F0E8DA]">
          <EditProfileForm currentName={currentName} />
        </div>
      </div>

      {/* Groups */}
      {memberships.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-[#0E0C0A] mb-3">{t("nav.myGroups")}</h3>
          <div className="space-y-2">
            {memberships.map((m) => (
              <div key={m.group_id} className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-medium text-[#0E0C0A]">{m.groupName}</p>
                  <p className="text-xs text-[#9A8878]">{roleLabels[m.role] || m.role}</p>
                </div>
                {m.role === "admin" && (
                  <Link href="/convite/enviar" className="text-xs text-[#C07055] font-medium hover:underline">
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
        <Link href="/assinatura" className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#0E0C0A]">{t("profile.subscriptionLink")}</span>
            <svg className="w-5 h-5 text-[#9A8878]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
        <Link href="/criancas" className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#0E0C0A]">{t("nav.manageChildren")}</span>
            <svg className="w-5 h-5 text-[#9A8878]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
        <Link href="/documentos" className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#0E0C0A]">{t("nav.documents")}</span>
            <svg className="w-5 h-5 text-[#9A8878]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
        <Link href="/perfil/notificacoes" className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#0E0C0A]">{t("notifPrefs.title")}</span>
            <svg className="w-5 h-5 text-[#9A8878]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>

      {/* Referral — secundário, vai antes do logout pra não competir
          com a info primária do perfil. F#50 (E2E loop iter 2): antes
          ficava no topo da página, acima do header "Perfil". */}
      {referral && (
        <ReferralCard
          code={referral.code}
          totalClicks={referral.totalClicks}
          totalSignups={referral.totalSignups}
          totalRewards={referral.totalRewards}
          monthsEarned={referral.monthsEarned}
        />
      )}

      {/* Sign Out */}
      <form action={signOut}>
        <button type="submit"
          className="w-full py-3 bg-[#F5EFE6] text-[#6B5F52] font-semibold rounded-xl hover:bg-[#EDE3D2] transition-colors">
          {t("auth.logout")}
        </button>
      </form>

      {/* Zona de Perigo — padrão GitHub/Stripe. Borda vermelha demarca claramente
          ações destrutivas pra não serem clicadas por engano. Apple GR 5.1.1(v)
          exige delete account in-app — fica visível mas separado. */}
      <section
        aria-labelledby="danger-zone"
        className="mt-8 rounded-xl border border-red-200 bg-red-50/40 p-5"
      >
        <h3 id="danger-zone" className="text-sm font-bold text-red-700 uppercase tracking-wider mb-1">
          {t("profile.dangerZone")}
        </h3>
        <p className="text-xs text-red-600/80 mb-4">{t("profile.dangerZoneHint")}</p>
        <Link
          href="/perfil/deletar-conta"
          className="inline-flex items-center gap-2 text-sm font-medium text-red-700 hover:text-red-800 hover:underline transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
          {t("profile.deleteAccount.title")}
        </Link>
      </section>
    </div>
  );
}
