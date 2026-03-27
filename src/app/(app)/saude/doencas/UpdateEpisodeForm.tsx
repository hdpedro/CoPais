"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/provider";

interface UpdateEpisodeFormProps {
  episodeId: string;
  updateAction: (formData: FormData) => Promise<void>;
}

const QUICK_UPDATE_KEYS = [
  { key: "improved", icon: "\uD83D\uDCC8" },
  { key: "worsened", icon: "\uD83D\uDCC9" },
  { key: "fever", icon: "\uD83C\uDF21\uFE0F" },
  { key: "noFever", icon: "\u2705" },
  { key: "vomiting", icon: "\uD83E\uDD22" },
  { key: "medicated", icon: "\uD83D\uDC8A" },
];

export default function UpdateEpisodeForm({
  episodeId,
  updateAction,
}: UpdateEpisodeFormProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const QUICK_UPDATES = QUICK_UPDATE_KEYS.map((q) => ({
    label: t(`health.updateEpisode.quick_${q.key}`),
    icon: q.icon,
    value: t(`health.updateEpisode.quick_${q.key}`),
  }));

  function addQuickUpdate(text: string) {
    setNote((prev) => (prev ? `${prev}, ${text}` : text));
  }

  function handleSubmit(formData: FormData) {
    if (!note.trim()) return;
    formData.set("episodeId", episodeId);
    formData.set("evolutionNote", note.trim());
    startTransition(() => {
      updateAction(formData).then(() => {
        setNote("");
        setIsOpen(false);
      });
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full text-center text-xs font-semibold text-blue-700 bg-blue-50/50 hover:bg-blue-50 py-2.5 transition-colors flex items-center justify-center gap-1.5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {t("health.updateEpisode.updateState")}
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="p-3 bg-blue-50/50 animate-[fadeIn_200ms_ease-out]">
      <p className="text-xs font-semibold text-dark mb-2">{t("health.updateEpisode.howIsNow")}</p>

      {/* Quick update chips */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {QUICK_UPDATES.map((q) => (
          <button
            key={q.value}
            type="button"
            onClick={() => addQuickUpdate(q.value)}
            className={`px-2.5 py-1 text-[11px] rounded-full transition-all ${
              note.includes(q.value)
                ? "bg-blue-500 text-white"
                : "bg-white text-dark border border-gray-200 hover:border-blue-300"
            }`}
          >
            {q.icon} {q.label}
          </button>
        ))}
      </div>

      {/* Free text */}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("health.updateEpisode.placeholder")}
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 mb-2"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setIsOpen(false); setNote(""); }}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg text-muted hover:bg-gray-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={isPending || !note.trim()}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? t("health.updateEpisode.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}
