import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDisplayName } from "@/lib/constants";
import { getReferralStats } from "@/lib/referral";
import ProfileContent from "./ProfileContent";
import { getWhatsAppLinkStatus } from "@/actions/whatsapp";
import { getRequestLocale } from "@/i18n/server";

// BCP 47 region tags used for Intl formatters. Mirror of intlLocale in
// dashboard/page.tsx — same fallback policy. Centralizing in a helper is
// planned (lib/locale-utils.ts) once 3+ server pages need this map.
const INTL_LOCALE: Record<string, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getRequestLocale();
  const bcp47 = INTL_LOCALE[locale] ?? "pt-BR";

  const [{ data: profile }, { data: memberships }, waStatus, referralStats] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("group_members")
      .select("group_id, role, coparenting_groups(name)")
      .eq("user_id", user.id),
    getWhatsAppLinkStatus(),
    getReferralStats(supabase, user.id),
  ]);

  const displayName = getDisplayName(profile?.full_name) || "?";
  // Locale-aware "member since" date. "—" stays language-neutral (em-dash).
  const createdAt = profile?.created_at
    ? new Intl.DateTimeFormat(bcp47).format(new Date(profile.created_at))
    : "—";

  const mappedMemberships = (memberships || []).map((m) => ({
    group_id: m.group_id,
    role: m.role,
    groupName: (m.coparenting_groups as unknown as { name: string } | null)?.name || "—",
  }));

  // F#50 (E2E loop iter 2): Referral movido pra DENTRO de ProfileContent
  // (logo antes de Logout) ao invés de no topo. Razão: hierarquia visual
  // = info primária do user primeiro, ações secundárias (referral) depois.
  return (
    <ProfileContent
      displayName={displayName}
      email={user.email || ""}
      phone={profile?.phone}
      roleName={profile?.role || "parent"}
      createdAt={createdAt}
      currentName={profile?.full_name || ""}
      memberships={mappedMemberships}
      whatsappStatus={waStatus?.status || "unlinked"}
      whatsappPhone={waStatus?.status !== "unlinked" ? waStatus?.phone : undefined}
      referral={
        referralStats
          ? {
              code: referralStats.code,
              totalClicks: referralStats.totalClicks,
              totalSignups: referralStats.totalSignups,
              totalRewards: referralStats.totalRewards,
              monthsEarned: referralStats.monthsEarned,
            }
          : null
      }
    />
  );
}
