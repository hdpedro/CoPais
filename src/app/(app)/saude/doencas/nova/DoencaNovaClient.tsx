"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import IllnessWizard from "./IllnessWizard";

interface Props {
  groupId: string;
  childrenList: { id: string; full_name: string }[];
  today: string;
  error?: string;
  createAction: (formData: FormData) => Promise<void>;
}

export default function DoencaNovaClient({ groupId, childrenList, today, error: errorMsg, createAction }: Props) {
  const { t } = useI18n();

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("health.wizard.title")}</h1>
          <p className="text-sm text-muted">{t("health.wizard.subtitle")}</p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      <IllnessWizard
        groupId={groupId}
        childrenList={childrenList}
        today={today}
        createAction={createAction}
      />
    </div>
  );
}
