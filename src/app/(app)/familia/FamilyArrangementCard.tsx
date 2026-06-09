"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/provider";
import { setFamilyArrangement } from "@/actions/group";

type Arrangement = "rotating" | "together" | "single" | "custom";

const OPTIONS: { key: Exclude<Arrangement, "custom">; icon: string; labelKey: string }[] = [
  { key: "rotating", icon: "🔄", labelKey: "familyPage.arrangementRotating" },
  { key: "together", icon: "🏠", labelKey: "familyPage.arrangementTogether" },
  { key: "single", icon: "👤", labelKey: "familyPage.arrangementSingle" },
];

/**
 * Card "Forma da família" na tela Família — o lar integrado da escolha
 * separados ↔ moram juntos/solo. Move o Herói do painel (guarda vs rotina) +
 * acopla custódia. Escrita via action robusta (admin write). Editável só por
 * admin; afeta o grupo inteiro (decisão de família).
 */
export default function FamilyArrangementCard({
  groupId,
  arrangement: initial,
  isAdmin,
}: {
  groupId: string;
  arrangement: Arrangement;
  isAdmin: boolean;
}) {
  const { t } = useI18n();
  const [arrangement, setArrangement] = useState<Arrangement>(initial);
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(a: Exclude<Arrangement, "custom">) {
    if (!isAdmin || a === arrangement || pending) return;
    const prev = arrangement;
    setArrangement(a); // otimista
    setFeedback(null);
    startTransition(async () => {
      const res = await setFamilyArrangement(groupId, a);
      if (res?.error) {
        setArrangement(prev); // reverte
        setFeedback("error");
        return;
      }
      setFeedback("saved");
    });
  }

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
        <span className="text-sm" aria-hidden="true">🧭</span>
        {t("familyPage.arrangementTitle")}
      </h2>
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="space-y-1.5">
          {OPTIONS.map((o) => {
            const selected = arrangement === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => choose(o.key)}
                disabled={!isAdmin || pending}
                aria-pressed={selected}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-2 text-left text-sm transition-colors disabled:opacity-60 ${
                  selected
                    ? "border-primary bg-primary/5 text-dark font-medium"
                    : "border-gray-200 text-muted hover:border-gray-300"
                } ${isAdmin ? "" : "cursor-default"}`}
              >
                <span className="text-base flex-shrink-0" aria-hidden="true">{o.icon}</span>
                <span className="flex-1">{t(o.labelKey)}</span>
                {selected && <span className="text-primary" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted mt-2">{t("familyPage.arrangementHint")}</p>
        {feedback === "saved" && (
          <p className="text-[11px] text-green-600 mt-1.5" role="status">
            {t("familyPage.arrangementSaved")}
          </p>
        )}
        {feedback === "error" && (
          <p className="text-[11px] text-amber-600 mt-1.5" role="status">
            {t("familyPage.arrangementError")}
          </p>
        )}
      </div>
    </section>
  );
}
