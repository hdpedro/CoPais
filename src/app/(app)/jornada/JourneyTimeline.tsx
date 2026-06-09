"use client";

import { useI18n } from "@/i18n/provider";
import type { JourneyItem } from "@/lib/care-routine-journey";

/**
 * Timeline vertical da "Jornada da Criança" — casa → leva → atividades → busca
 * → casa. Os rótulos por tipo são i18n; o texto (nome/atividade) vem dos dados.
 */
export default function JourneyTimeline({ childName, items }: { childName: string; items: JourneyItem[] }) {
  const { t } = useI18n();

  const label = (it: JourneyItem) => {
    switch (it.kind) {
      case "home":
        return t("careRoutine.journeyHome", { name: it.text });
      case "dropoff":
        return t("careRoutine.journeyDropoff", { name: it.text });
      case "pickup":
        return t("careRoutine.journeyPickup", { name: it.text });
      default:
        return it.text;
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-[17px] font-semibold text-[#2A2622]">{childName}</h2>
        <span className="text-[11px] uppercase tracking-wide text-muted font-medium">{t("careRoutine.journeyTitle")}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted">{t("careRoutine.journeyEmpty")}</p>
      ) : (
        <ol className="relative border-l-2 border-gray-100 ml-2 space-y-3.5">
          {items.map((it) => (
            <li key={it.key} className="ml-4 relative">
              <span className="absolute -left-[1.5rem] -top-0.5 text-base bg-white">{it.icon}</span>
              <div className="flex items-baseline gap-2">
                {it.time ? (
                  <span className="text-[11px] tabular-nums text-muted w-10 flex-shrink-0">{it.time}</span>
                ) : (
                  <span className="w-10 flex-shrink-0" />
                )}
                <span className="text-[13px] text-dark">{label(it)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
