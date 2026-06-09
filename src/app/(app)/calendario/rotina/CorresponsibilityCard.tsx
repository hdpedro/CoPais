"use client";

import { useI18n } from "@/i18n/provider";
import type { CorresponsibilityRow } from "@/lib/care-routine-metrics";

interface Props {
  rows: CorresponsibilityRow[];
  premium: boolean;
  monthLabel: string;
}

/**
 * Corresponsabilidade — contagens NEUTRAS do mês (sem %/ranking/vermelho).
 * Só aparece quando já há registros. Premium-gated (Harmonia): não-premium vê
 * um teaser calmo, não os números.
 */
export default function CorresponsibilityCard({ rows, premium, monthLabel }: Props) {
  const { t } = useI18n();
  const hasData = rows.some((r) => r.total > 0);
  if (!hasData) return null;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-dark mb-0.5">{t("careRoutine.metricsTitle")}</h3>
      <p className="text-xs text-muted mb-3">{t("careRoutine.metricsSubtitle", { month: monthLabel })}</p>
      {!premium ? (
        <p className="text-xs text-muted bg-gray-50 rounded-lg p-3">{t("careRoutine.metricsPremium")}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.userId} className="flex items-center justify-between text-sm">
              <span className="text-dark font-medium">{r.name}</span>
              <span className="text-muted text-xs">
                {t("careRoutine.metricsCounts", { dropoff: r.dropoff, pickup: r.pickup })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
