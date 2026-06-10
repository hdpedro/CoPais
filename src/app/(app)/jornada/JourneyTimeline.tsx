"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import type { JourneyItem } from "@/lib/care-routine-journey";

/** Toda parada navega ("sempre clicável" — dono 10/jun): atividade → detalhe
 *  relatável; evento → o EVENTO específico no calendário (deep-link day+eventId,
 *  mesmo contrato do painel); casa → o dia no calendário; leva/busca → rotina. */
function hrefFor(it: JourneyItem, dateKey: string): string {
  if (it.kind === "activity") {
    if (it.activityId) return `/atividades/${it.activityId}`;
    if (it.eventId) return `/calendario?day=${dateKey}&eventId=${it.eventId}`;
    return `/calendario?day=${dateKey}`;
  }
  if (it.kind === "home") return `/calendario?day=${dateKey}`;
  return "/calendario/rotina";
}

/**
 * Timeline vertical da "Jornada da Criança" — casa → leva → atividades → busca
 * → casa. Os rótulos por tipo são i18n; o texto (nome/atividade) vem dos dados.
 */
export default function JourneyTimeline({
  childName,
  items,
  dateKey,
}: {
  childName: string;
  items: JourneyItem[];
  dateKey: string;
}) {
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
              <Link
                href={hrefFor(it, dateKey)}
                prefetch={false}
                className="flex items-baseline gap-2 -mx-1.5 px-1.5 py-0.5 rounded-lg hover:bg-[#F4F0E9] transition-colors"
              >
                {it.time ? (
                  <span className="text-[11px] tabular-nums text-muted w-10 flex-shrink-0">{it.time}</span>
                ) : (
                  <span className="w-10 flex-shrink-0" />
                )}
                <span className="text-[13px] text-dark">{label(it)}</span>
                {it.responsible ? (
                  <span className="text-[12px] text-[#C07055] font-medium flex-shrink-0">· {it.responsible}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
