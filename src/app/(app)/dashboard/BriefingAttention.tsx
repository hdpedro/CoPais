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

  // O topo da régua, quando exige você (tom "attention"), vira o MOMENTO —
  // um card terracota editorial (o "Eu cuido" do mockup). O resto desce pra a
  // lista calma. Se o topo já é calmo (dia tranquilo de ações), tudo vira lista.
  const moment = items[0]?.tone === "attention" ? items[0] : null;
  const listItems = moment ? items.slice(1) : items;
  const momentCopy = moment ? copy(moment) : null;

  return (
    <section aria-label={t("briefing.attentionTitle")}>
      <h3 className="text-[12px] uppercase tracking-wider text-[#7A8C8B] font-semibold mb-3 px-1">
        {t("briefing.attentionTitle")}
      </h3>

      {moment && momentCopy ? (
        <Link
          href={moment.link}
          prefetch={false}
          aria-label={`${momentCopy.title} — ${momentCopy.cta}`}
          className="group block rounded-2xl px-5 py-[18px] mb-2.5 shadow-[0_12px_30px_-14px_rgba(151,80,47,0.62)] transition-transform active:scale-[0.995]"
          style={{ background: "linear-gradient(150deg, #B86A4F 0%, #97502F 100%)" }}
        >
          <div className="flex items-start gap-3.5">
            <span aria-hidden="true" className="text-[21px] leading-none mt-[3px]">
              {ICON[moment.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[19px] leading-[1.25] text-[#FCF6F1]">
                {momentCopy.title}
              </p>
              <span className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#FCF6F1]/90">
                {momentCopy.cta}
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </div>
          </div>
        </Link>
      ) : null}

      {listItems.length > 0 ? (
        <div className="bg-white rounded-2xl border border-[#EDE7DF] shadow-[0_1px_2px_rgba(42,38,34,0.04)] divide-y divide-[#F2EDE6] overflow-hidden">
          {listItems.map((item) => {
            const { title, cta } = copy(item);
            const attention = item.tone === "attention";
            return (
              <Link
                key={item.id}
                href={item.link}
                prefetch={false}
                className="flex items-center gap-3.5 px-4 py-3.5 min-h-[58px] hover:bg-[#FBF7F3] transition-colors"
              >
                <span
                  aria-hidden="true"
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${
                    attention ? "bg-[#C07055]/[0.12]" : "bg-[#5B9E85]/[0.10]"
                  }`}
                >
                  {ICON[item.kind]}
                </span>
                <span className="flex-1 text-[14px] text-[#2A2622] font-medium leading-snug">
                  {title}
                </span>
                <span
                  className={`text-[12px] font-semibold flex-shrink-0 ${
                    attention ? "text-[#A85D47]" : "text-[#5B9E85]"
                  }`}
                >
                  {cta}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
