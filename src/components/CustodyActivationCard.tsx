"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enableCustody } from "@/actions/group";
import { useI18n } from "@/i18n/provider";

interface CustodyActivationCardProps {
  groupId: string;
  childName: string;
  memberCount: number;
}

export default function CustodyActivationCard({
  groupId,
  childName,
  memberCount,
}: CustodyActivationCardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`custody_activation_dismissed_${groupId}`) === "true";
  });
  const [isPending, startTransition] = useTransition();

  if (dismissed) return null;

  function handleEnable() {
    startTransition(async () => {
      await enableCustody(groupId);
      router.push("/calendario/escala");
    });
  }

  function handleDismiss() {
    localStorage.setItem(`custody_activation_dismissed_${groupId}`, "true");
    setDismissed(true);
  }

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#5B9E85]/10 flex items-center justify-center text-xl flex-shrink-0">
          📅
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-[#2C2C2C]">
            {t("dashboard.custodyActivationTitle")}
          </h3>
          <p className="text-[12px] text-[#7A8C8B] mt-0.5">
            {t("dashboard.custodyActivationDescription", {
              count: String(memberCount),
              childName,
            })}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleEnable}
              disabled={isPending}
              className="px-4 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#5B9E85" }}
            >
              {isPending ? "..." : t("dashboard.custodyActivationCta")}
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 rounded-lg text-[#7A8C8B] text-xs font-medium hover:bg-gray-100 transition-colors"
            >
              {t("dashboard.custodyActivationDismiss")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
