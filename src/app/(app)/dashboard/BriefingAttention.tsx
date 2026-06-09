"use client";

/**
 * "Sua Atenção" — a régua UNIFICADA do briefing (Dashboard v2.0).
 *
 * Consolida num só lugar, já priorizado pelo motor (`src/lib/briefing.ts`), o
 * que hoje vive espalhado em ~6 seções soltas: relato pendente, despesa a
 * aprovar, voto, novidades de escola/despesa/saúde e reforço de vacina.
 *
 * Componente "burro": só renderiza os itens que recebe (o motor decide o quê e
 * a ordem; a UI compõe a copy via `t()`). Tom da marca: âmbar pra atenção,
 * sálvia pra awareness calma — NUNCA vermelho. Vacina entra calma ("alguns
 * reforços pra ver"; o número detalhado vive em /saude).
 *
 * a11y: `aria-label` na seção; cada linha é um Link com texto descritivo;
 * ícone é decorativo (`aria-hidden`); alvos ≥44px; contraste AA.
 */

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import type { AttentionItem, AttentionKind } from "@/lib/briefing";

const ICON: Record<AttentionKind, string> = {
  swap: "⇄",
  routine_ack: "🔔",
  pending_report: "📝",
  pending_expense: "🧾",
  pending_decision: "🗳️",
  saude_unread: "🩺",
  school_unread: "🎒",
  expenses_unread: "💰",
  vaccine: "💉",
};

export default function BriefingAttention({ items }: { items: AttentionItem[] }) {
  const { t } = useI18n();
  if (items.length === 0) return null;

  function copy(item: AttentionItem): { title: string; cta: string } {
    switch (item.kind) {
      case "swap":
        return { title: t("briefing.swap", item.data), cta: t("briefing.ctaView") };
      case "routine_ack":
        return {
          title: item.data.awaiting
            ? t("briefing.routineAckMine")
            : t("briefing.routineAckTheirs", item.data),
          cta: t("briefing.ctaView"),
        };
      case "pending_report":
        return { title: t("briefing.pendingReport", item.data), cta: t("briefing.ctaReport") };
      case "pending_expense":
        return { title: t("briefing.pendingExpense", item.data), cta: t("briefing.ctaView") };
      case "pending_decision":
        return { title: t("briefing.pendingDecision", item.data), cta: t("briefing.ctaVote") };
      case "school_unread":
        return { title: t("briefing.schoolNew", item.data), cta: t("briefing.ctaView") };
      case "expenses_unread":
        return { title: t("briefing.expensesNew", item.data), cta: t("briefing.ctaView") };
      case "saude_unread":
        return { title: t("briefing.saudeNew", item.data), cta: t("briefing.ctaView") };
      case "vaccine":
        return { title: t("briefing.vaccineCalm"), cta: t("briefing.ctaView") };
    }
  }

  return (
    <section aria-label={t("briefing.attentionTitle")}>
      <h3 className="text-[12px] uppercase tracking-wider text-[#7A8C8B] font-semibold mb-3 px-1">
        {t("briefing.attentionTitle")}
      </h3>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
        {items.map((item) => {
          const { title, cta } = copy(item);
          const attention = item.tone === "attention";
          return (
            <Link
              key={item.id}
              href={item.link}
              prefetch={false}
              className="flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-[#FBF8F4] transition-colors"
            >
              <span
                aria-hidden="true"
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${
                  attention ? "bg-[#E8A228]/[0.12]" : "bg-[#5B9E85]/[0.10]"
                }`}
              >
                {ICON[item.kind]}
              </span>
              <span className="flex-1 text-[13.5px] text-[#2C2C2C] font-medium leading-snug">
                {title}
              </span>
              <span
                className={`text-[12px] font-semibold flex-shrink-0 ${
                  attention ? "text-[#C2701E]" : "text-[#5B9E85]"
                }`}
              >
                {cta}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
