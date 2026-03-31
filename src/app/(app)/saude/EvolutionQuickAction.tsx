"use client";

import { useState, useTransition } from "react";
import { addEvolutionQuick } from "@/actions/health";
import { useI18n } from "@/i18n/provider";

interface EvolutionQuickActionProps {
  episodeId: string;
  episodeTitle: string;
}

export default function EvolutionQuickAction({ episodeId, episodeTitle }: EvolutionQuickActionProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<"improving" | "worsening" | null>(null);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleSubmit(type: "improving" | "worsening") {
    const formData = new FormData();
    formData.set("episodeId", episodeId);
    formData.set("type", type);
    formData.set("note", note);

    startTransition(async () => {
      const result = await addEvolutionQuick(formData);
      if (result.success) {
        setFeedback(type === "improving" ? t("health.evolution.savedImproving") : t("health.evolution.savedWorsening"));
        setExpanded(null);
        setNote("");
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  }

  if (feedback) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
        <span className="text-sm">✅</span>
        <p className="text-sm text-green-700 font-medium">{feedback}</p>
      </div>
    );
  }

  if (expanded) {
    return (
      <div className="p-3 rounded-xl bg-white border border-gray-200 space-y-2">
        <p className="text-xs font-medium text-dark">
          {expanded === "improving" ? "📈" : "📉"} {episodeTitle}
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("health.evolution.notePlaceholder")}
          className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:border-primary/50"
          rows={2}
          maxLength={500}
        />
        <div className="flex gap-2">
          <button
            onClick={() => handleSubmit(expanded)}
            disabled={isPending}
            className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-colors ${
              expanded === "improving"
                ? "bg-green-500 hover:bg-green-600 text-white"
                : "bg-red-500 hover:bg-red-600 text-white"
            } disabled:opacity-50`}
          >
            {isPending ? t("health.evolution.saving") : t("health.evolution.confirm")}
          </button>
          <button
            onClick={() => { setExpanded(null); setNote(""); }}
            className="px-4 text-sm text-muted hover:text-dark py-2 rounded-lg bg-gray-50"
          >
            {t("health.evolution.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => setExpanded("improving")}
        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 py-2.5 rounded-xl transition-colors"
      >
        📈 {t("health.evolution.improved")}
      </button>
      <button
        onClick={() => setExpanded("worsening")}
        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 py-2.5 rounded-xl transition-colors"
      >
        📉 {t("health.evolution.worsened")}
      </button>
    </div>
  );
}
