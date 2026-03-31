"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { createSymptomEntry } from "@/actions/health";
import { getDisplayName } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChildOption {
  id: string;
  full_name: string;
  birth_date: string;
}

interface SymptomEntry {
  id: string;
  recorded_at: string;
  symptom_type: string;
  temperature: number | null;
  intensity: string | null;
  notes: string | null;
  illness_episode_id: string | null;
  created_by: string;
  authorName: string | null;
}

interface EpisodeOption {
  id: string;
  title: string;
}

interface Props {
  childrenList: ChildOption[];
  selectedChildId: string;
  selectedChildName: string;
  selectedChildBirthDate: string;
  entries: SymptomEntry[];
  activeEpisodes: EpisodeOption[];
  groupId: string;
  isReadonly: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYMPTOM_CONFIG: Record<
  string,
  { icon: string; labelKey: string; color: string; gradient: string }
> = {
  febre: {
    icon: "\uD83C\uDF21\uFE0F",
    labelKey: "symptomDiary.typeFever",
    color: "text-red-600",
    gradient: "from-red-50 to-red-100 border-red-200",
  },
  vomito: {
    icon: "\uD83E\uDD2E",
    labelKey: "symptomDiary.typeVomit",
    color: "text-amber-600",
    gradient: "from-amber-50 to-amber-100 border-amber-200",
  },
  diarreia: {
    icon: "\uD83D\uDCA9",
    labelKey: "symptomDiary.typeDiarrhea",
    color: "text-yellow-700",
    gradient: "from-yellow-50 to-yellow-100 border-yellow-200",
  },
  tosse: {
    icon: "\uD83D\uDE37",
    labelKey: "symptomDiary.typeCough",
    color: "text-blue-600",
    gradient: "from-blue-50 to-blue-100 border-blue-200",
  },
  dor: {
    icon: "\uD83D\uDE23",
    labelKey: "symptomDiary.typePain",
    color: "text-purple-600",
    gradient: "from-purple-50 to-purple-100 border-purple-200",
  },
  mancha: {
    icon: "\uD83D\uDD34",
    labelKey: "symptomDiary.typeRash",
    color: "text-pink-600",
    gradient: "from-pink-50 to-pink-100 border-pink-200",
  },
  falta_apetite: {
    icon: "\uD83C\uDF7D\uFE0F",
    labelKey: "symptomDiary.typeNoAppetite",
    color: "text-orange-600",
    gradient: "from-orange-50 to-orange-100 border-orange-200",
  },
  outro: {
    icon: "\u270F\uFE0F",
    labelKey: "symptomDiary.typeOther",
    color: "text-gray-600",
    gradient: "from-gray-50 to-gray-100 border-gray-200",
  },
};

const INTENSITY_CONFIG: Record<
  string,
  { labelKey: string; color: string; bg: string }
> = {
  leve: {
    labelKey: "symptomDiary.intensityMild",
    color: "text-green-700",
    bg: "bg-green-100",
  },
  moderado: {
    labelKey: "symptomDiary.intensityModerate",
    color: "text-amber-700",
    bg: "bg-amber-100",
  },
  forte: {
    labelKey: "symptomDiary.intensityStrong",
    color: "text-red-700",
    bg: "bg-red-100",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeAge(birthDate: string): string {
  const birth = new Date(birthDate + "T12:00:00");
  const now = new Date();
  const years = now.getFullYear() - birth.getFullYear();
  const months = now.getMonth() - birth.getMonth();
  const totalMonths = years * 12 + months;
  if (totalMonths < 12) return `${totalMonths}m`;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  return m > 0 ? `${y}a ${m}m` : `${y}a`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function formatDayLabel(dateStr: string, todayStr: string, yesterdayStr: string): string {
  const entryDate = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const entryDay = entryDate.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const todayDay = today.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const yesterdayDay = yesterday.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  if (entryDay === todayDay) return todayStr;
  if (entryDay === yesterdayDay) return yesterdayStr;
  return entryDay;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SintomasClient({
  childrenList,
  selectedChildId,
  selectedChildName,
  selectedChildBirthDate,
  entries,
  activeEpisodes,
  groupId,
  isReadonly,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSymptom, setSelectedSymptom] = useState<string | null>(null);
  const [intensity, setIntensity] = useState<string>("moderado");
  const [temperature, setTemperature] = useState("");
  const [notes, setNotes] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Group entries by day
  const groupedEntries = useMemo(() => {
    const groups: Record<string, SymptomEntry[]> = {};
    for (const entry of entries) {
      const dayKey = new Date(entry.recorded_at).toLocaleDateString("pt-BR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "America/Sao_Paulo",
      });
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(entry);
    }
    return groups;
  }, [entries]);

  const openModal = useCallback((symptomType: string) => {
    setSelectedSymptom(symptomType);
    setIntensity("moderado");
    setTemperature("");
    setNotes("");
    setEpisodeId("");
    setSubmitError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSelectedSymptom(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedSymptom) return;
    setSubmitError(null);

    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("childId", selectedChildId);
    formData.set("symptomType", selectedSymptom);
    formData.set("intensity", intensity);
    if (selectedSymptom === "febre" && temperature) {
      formData.set("temperature", temperature);
    }
    if (notes.trim()) formData.set("notes", notes.trim());
    if (episodeId) formData.set("illnessEpisodeId", episodeId);

    startTransition(async () => {
      const result = await createSymptomEntry(formData);
      if (result.success) {
        setShowSuccess(true);
        closeModal();
        setTimeout(() => setShowSuccess(false), 2000);
      } else {
        setSubmitError(result.error || t("symptomDiary.errorGeneric"));
      }
    });
  }, [selectedSymptom, groupId, selectedChildId, intensity, temperature, notes, episodeId, closeModal, t]);

  const handleShare = useCallback(() => {
    const childAge = computeAge(selectedChildBirthDate);
    const firstName = selectedChildName.split(" ")[0];

    // Build date range
    const dates = entries.map((e) => new Date(e.recorded_at));
    const earliest = dates.length > 0 ? dates[dates.length - 1] : new Date();
    const latest = dates.length > 0 ? dates[0] : new Date();
    const fmtDate = (d: Date) =>
      d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
    const dateRange = `${fmtDate(earliest)} - ${fmtDate(latest)}`;

    let text = `\uD83D\uDCCB ${t("symptomDiary.shareTitle")} \u2014 ${firstName} (${childAge})\n`;
    text += `\uD83D\uDCC5 ${dateRange}\n\n`;

    const dayKeys = Object.keys(groupedEntries);
    for (const dayKey of dayKeys) {
      const dayEntries = groupedEntries[dayKey];
      text += `\u2501\u2501 ${dayKey} \u2501\u2501\n`;
      for (const entry of dayEntries) {
        const cfg = SYMPTOM_CONFIG[entry.symptom_type] || SYMPTOM_CONFIG.outro;
        const time = formatTime(entry.recorded_at);
        const label = t(cfg.labelKey);
        const intensityLabel = entry.intensity
          ? ` (${t(INTENSITY_CONFIG[entry.intensity]?.labelKey || "symptomDiary.intensityModerate")})`
          : "";
        const tempSuffix =
          entry.temperature ? ` ${entry.temperature}\u00B0C` : "";
        text += `${time} \u2014 ${cfg.icon} ${label}${intensityLabel}${tempSuffix}\n`;
        if (entry.notes) text += `  ${entry.notes}\n`;
      }
      text += "\n";
    }

    if (entries.length === 0) {
      text += t("symptomDiary.noEntries") + "\n";
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2500);
    });
  }, [entries, groupedEntries, selectedChildName, selectedChildBirthDate, t]);

  const symptomTypes = Object.keys(SYMPTOM_CONFIG);
  const childFirstName = selectedChildName.split(" ")[0];

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-[#E8E0D4]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/saude"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-[#F5F0EB] text-dark hover:bg-[#E8E0D4] transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-dark truncate">
              {t("symptomDiary.title")}
            </h1>
            <p className="text-xs text-muted truncate">{childFirstName}</p>
          </div>
        </div>

        {/* Child selector tabs */}
        {childrenList.length > 1 && (
          <div className="max-w-lg mx-auto px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
            {childrenList.map((child) => {
              const isActive = child.id === selectedChildId;
              return (
                <button
                  key={child.id}
                  onClick={() =>
                    router.push(`/saude/sintomas?crianca=${child.id}`)
                  }
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary text-white shadow-sm"
                      : "bg-[#F5F0EB] text-muted hover:bg-[#E8E0D4]"
                  }`}
                >
                  {getDisplayName(child.full_name, true)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Success flash */}
        {showSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium text-center animate-in fade-in slide-in-from-top-2 duration-300">
            {t("symptomDiary.successMessage")}
          </div>
        )}

        {/* Quick-log buttons */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            {t("symptomDiary.quickLog")}
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {symptomTypes.map((type) => {
              const cfg = SYMPTOM_CONFIG[type];
              return (
                <button
                  key={type}
                  onClick={() => openModal(type)}
                  disabled={isReadonly}
                  className={`relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border bg-gradient-to-b ${cfg.gradient} active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md`}
                >
                  <span className="text-2xl leading-none">{cfg.icon}</span>
                  <span className="text-[11px] font-medium text-dark leading-tight text-center">
                    {t(cfg.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Timeline */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            {t("symptomDiary.timeline")}
          </h2>

          {entries.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-[#E8E0D4]">
              <span className="text-4xl mb-3 block">{"\uD83D\uDCDD"}</span>
              <p className="text-muted text-sm">{t("symptomDiary.noEntries")}</p>
              <p className="text-muted text-xs mt-1">
                {t("symptomDiary.noEntriesHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedEntries).map(([dayKey, dayEntries]) => {
                const dayLabel = formatDayLabel(
                  dayEntries[0].recorded_at,
                  t("symptomDiary.today"),
                  t("symptomDiary.yesterday"),
                );
                return (
                  <div key={dayKey}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-dark uppercase">
                        {dayLabel}
                      </span>
                      <div className="flex-1 h-px bg-[#E8E0D4]" />
                      <span className="text-xs text-muted">
                        {dayEntries.length}{" "}
                        {dayEntries.length === 1
                          ? t("symptomDiary.entry")
                          : t("symptomDiary.entries")}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {dayEntries.map((entry) => {
                        const cfg =
                          SYMPTOM_CONFIG[entry.symptom_type] ||
                          SYMPTOM_CONFIG.outro;
                        const intensityCfg = entry.intensity
                          ? INTENSITY_CONFIG[entry.intensity]
                          : null;
                        return (
                          <div
                            key={entry.id}
                            className="bg-white rounded-xl border border-[#E8E0D4] p-3 shadow-sm"
                          >
                            <div className="flex items-start gap-3">
                              {/* Time indicator */}
                              <div className="flex-shrink-0 w-12 text-center">
                                <span className="text-xs font-mono font-semibold text-muted">
                                  {formatTime(entry.recorded_at)}
                                </span>
                              </div>
                              {/* Icon */}
                              <div className="flex-shrink-0 text-xl leading-none mt-0.5">
                                {cfg.icon}
                              </div>
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-dark">
                                    {t(cfg.labelKey)}
                                  </span>
                                  {intensityCfg && (
                                    <span
                                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${intensityCfg.bg} ${intensityCfg.color}`}
                                    >
                                      {t(intensityCfg.labelKey)}
                                    </span>
                                  )}
                                  {entry.temperature && (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                                      {entry.temperature}&deg;C
                                    </span>
                                  )}
                                </div>
                                {entry.notes && (
                                  <p className="text-xs text-muted mt-1 line-clamp-2">
                                    {entry.notes}
                                  </p>
                                )}
                                {entry.authorName && (
                                  <p className="text-[10px] text-muted/70 mt-1">
                                    {t("symptomDiary.by")}{" "}
                                    {getDisplayName(entry.authorName, true)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Share button - fixed bottom */}
      {entries.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-20 px-4 pb-2">
          <div className="max-w-lg mx-auto">
            <button
              onClick={handleShare}
              className="w-full py-3 px-4 bg-white border border-[#E8E0D4] rounded-xl shadow-lg text-sm font-semibold text-dark flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:shadow-xl"
            >
              <span>{"\uD83D\uDCCB"}</span>
              {copiedToClipboard
                ? t("symptomDiary.copied")
                : t("symptomDiary.shareWithDoctor")}
            </button>
          </div>
        </div>
      )}

      {/* Bottom sheet modal */}
      {modalOpen && selectedSymptom && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={closeModal}
          />
          {/* Sheet */}
          <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out">
            <div className="p-5">
              {/* Drag handle */}
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

              {/* Symptom title */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-3xl">
                  {SYMPTOM_CONFIG[selectedSymptom]?.icon}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-dark">
                    {t(
                      SYMPTOM_CONFIG[selectedSymptom]?.labelKey ||
                        "symptomDiary.typeOther",
                    )}
                  </h3>
                  <p className="text-xs text-muted">
                    {childFirstName} &middot;{" "}
                    {new Date().toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Sao_Paulo",
                    })}
                  </p>
                </div>
              </div>

              {/* Intensity */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">
                  {t("symptomDiary.intensity")}
                </label>
                <div className="flex gap-2">
                  {(["leve", "moderado", "forte"] as const).map((level) => {
                    const cfg = INTENSITY_CONFIG[level];
                    const isActive = intensity === level;
                    return (
                      <button
                        key={level}
                        onClick={() => setIntensity(level)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                          isActive
                            ? `${cfg.bg} ${cfg.color} ring-2 ring-offset-1 ${
                                level === "leve"
                                  ? "ring-green-400"
                                  : level === "moderado"
                                    ? "ring-amber-400"
                                    : "ring-red-400"
                              }`
                            : "bg-[#F5F0EB] text-muted"
                        }`}
                      >
                        {t(cfg.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Temperature (only for febre) */}
              {selectedSymptom === "febre" && (
                <div className="mb-4">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">
                    {t("symptomDiary.temperature")}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="35"
                      max="43"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      placeholder="37.5"
                      className="w-full px-4 py-3 rounded-xl border border-[#E8E0D4] bg-[#FAF8F5] text-dark text-lg font-semibold placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted font-medium">
                      &deg;C
                    </span>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">
                  {t("symptomDiary.notes")}{" "}
                  <span className="text-muted/60 normal-case font-normal">
                    ({t("common.optional")})
                  </span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder={t("symptomDiary.notesPlaceholder")}
                  className="w-full px-4 py-3 rounded-xl border border-[#E8E0D4] bg-[#FAF8F5] text-dark text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
                />
              </div>

              {/* Episode link */}
              {activeEpisodes.length > 0 && (
                <div className="mb-5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">
                    {t("symptomDiary.linkEpisode")}{" "}
                    <span className="text-muted/60 normal-case font-normal">
                      ({t("common.optional")})
                    </span>
                  </label>
                  <select
                    value={episodeId}
                    onChange={(e) => setEpisodeId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-[#E8E0D4] bg-[#FAF8F5] text-dark text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  >
                    <option value="">
                      {t("symptomDiary.noEpisodeLinked")}
                    </option>
                    {activeEpisodes.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        {ep.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Error */}
              {submitError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                  {submitError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="flex-1 py-3 rounded-xl bg-[#F5F0EB] text-muted font-semibold text-sm active:scale-95 transition-all"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="flex-[2] py-3 rounded-xl bg-primary text-white font-semibold text-sm active:scale-95 transition-all disabled:opacity-60 shadow-sm hover:shadow-md"
                >
                  {isPending
                    ? t("common.loading")
                    : t("symptomDiary.register")}
                </button>
              </div>
            </div>

            {/* Safe area for bottom navigation */}
            <div className="h-6 bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
