"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import Link from "next/link";
import { clearCustodySchedule } from "@/actions/calendar";

interface EscalaHeaderProps {
  hasExistingSchedule: boolean;
  eventCount: number;
  groupId: string;
}

export default function EscalaHeader({ hasExistingSchedule, eventCount, groupId }: EscalaHeaderProps) {
  const { t } = useI18n();
  const [showConfirm, setShowConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearCustodySchedule(groupId);
    } catch {
      // redirect throws, which is expected
    }
    setClearing(false);
    setShowConfirm(false);
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/calendario" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-dark">
            {hasExistingSchedule ? t("schedule.reconfigure") : t("schedule.configure")}
          </h1>
          <p className="text-sm text-muted">{t("schedule.buildPattern")}</p>
        </div>
      </div>

      {hasExistingSchedule && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">{t("schedule.alreadyConfigured")}</p>
              <p className="text-xs text-amber-600 mt-1">
                {t("schedule.existingEventsWarning", { count: String(eventCount) })}
              </p>
            </div>
          </div>

          {/* Clear Schedule Button */}
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="mt-3 w-full text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 hover:bg-red-100 transition-colors"
            >
              {t("schedule.clearSchedule")}
            </button>
          ) : (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
              <p className="text-xs text-red-700 font-medium">{t("schedule.clearConfirm")}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className="flex-1 text-sm font-semibold text-white bg-red-600 rounded-lg px-3 py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {clearing ? "..." : t("schedule.clearSchedule")}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={clearing}
                  className="flex-1 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
