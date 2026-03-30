"use client";

import { useState, useTransition } from "react";
import { deleteActivity } from "@/actions/activities";
import { useI18n } from "@/i18n/provider";

interface Props {
  activityId: string;
  activityName: string;
}

export default function DeleteActivityButton({ activityId, activityName }: Props) {
  const { t } = useI18n();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteActivity(activityId);
    });
  }

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
        className="p-2 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
        title={t("activities.removeActivity")}
      >
        <svg className="w-4 h-4 text-gray-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-center text-lg font-bold text-[#2C2C2C] mb-1">{t("activities.removeActivity")}</h3>
            <p className="text-center text-sm text-[#7A8C8B] mb-5">
              {t("activities.removeConfirmText", { name: activityName })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-[#2C2C2C] font-medium rounded-xl hover:bg-gray-50 text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 text-sm disabled:opacity-50"
              >
                {isPending ? t("activities.removing") : t("activities.remove")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
