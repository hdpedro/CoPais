"use client";

import type { ParentColorMap } from "@/lib/calendar-utils";
import { useI18n } from "@/i18n/provider";

interface SwapBalanceCardProps {
  balanceByUser: Record<string, number>;
  totalSwapDays: number;
  parentColors: ParentColorMap;
}

export default function SwapBalanceCard({
  balanceByUser,
  totalSwapDays,
  parentColors,
}: SwapBalanceCardProps) {
  const { t } = useI18n();
  if (totalSwapDays === 0) return null;

  const entries = Object.entries(balanceByUser)
    .filter(([id]) => parentColors[id])
    .sort((a, b) => b[1] - a[1]);

  const isBalanced = entries.every(([, val]) => val === 0);

  // Find who owes whom
  const debtor = entries.find(([, val]) => val < 0);
  const creditor = entries.find(([, val]) => val > 0);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-base font-semibold text-dark mb-3">{t("calendar.swapBalance")}</h3>

      {isBalanced ? (
        <div className="flex items-center gap-2 text-green-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">{t("calendar.balanced")}</span>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-3">
            {entries.map(([userId, balance]) => {
              const parent = parentColors[userId];
              if (!parent) return null;
              const isPositive = balance > 0;
              const isNeutral = balance === 0;

              return (
                <div key={userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: parent.color }}
                    />
                    <span className="text-sm text-dark">{parent.name}</span>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      isNeutral
                        ? "text-gray-500"
                        : isPositive
                        ? "text-green-600"
                        : "text-red-500"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {balance} {Math.abs(balance) === 1 ? t("calendar.day") : t("calendar.days")}
                  </span>
                </div>
              );
            })}
          </div>

          {debtor && creditor && (
            <p className="text-xs text-muted border-t border-gray-100 pt-2">
              {t("calendar.debtMessage", {
                name: parentColors[debtor[0]]?.name || "",
                count: Math.abs(debtor[1]),
                unit: Math.abs(debtor[1]) === 1 ? t("calendar.day") : t("calendar.days"),
                other: parentColors[creditor[0]]?.name || "",
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
