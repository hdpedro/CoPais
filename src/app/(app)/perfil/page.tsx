import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDisplayName } from "@/lib/constants";
import { getReferralStats } from "@/lib/referral";
import ProfileContent from "./ProfileContent";
import ReferralCard from "@/components/referral/ReferralCard";
import { getWhatsAppLinkStatus } from "@/actions/whatsapp";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
  const createdAt = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("pt-BR")
    : "—";

  const mappedMemberships = (memberships || []).map((m) => ({
    group_id: m.group_id,
    role: m.role,
    groupName: (m.coparenting_groups as unknown as { name: string } | null)?.name || "—",
  }));

  return (
    <>
      {referralStats && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <ReferralCard
            code={referralStats.code}
            totalClicks={referralStats.totalClicks}
            totalSignups={referralStats.totalSignups}
            totalRewards={referralStats.totalRewards}
            monthsEarned={referralStats.monthsEarned}
          />
        </div>
      )}
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
      />
    </>
  );
}
