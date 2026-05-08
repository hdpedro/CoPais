"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { getDisplayName } from "@/lib/constants";
import UpdateEpisodeForm from "./UpdateEpisodeForm";
import ResolveButton from "./ResolveButton";

interface ChildRef {
  full_name?: string | null;
}

interface ProfileRef {
  full_name?: string | null;
}

interface Episode {
  id: string;
  title: string;
  severity: string | null;
  start_date: string;
  end_date?: string | null;
  symptoms?: string[] | null;
  diagnosis?: string | null;
  notes?: string | null;
  hospital_visit?: boolean | null;
  hospital_name?: string | null;
  hospital_date?: string | null;
  created_at?: string | null;
  children?: ChildRef | ChildRef[] | null;
  profiles?: ProfileRef | ProfileRef[] | null;
}

interface Props {
  episodes: Episode[];
  activeEpisodes: Episode[];
  recoveredEpisodes: Episode[];
  isReadonly: boolean;
  today: string;
  success?: string;
  error?: string;
  updateAction: (formData: FormData) => Promise<void>;
  addEvolutionAction: (formData: FormData) => Promise<void>;
}

export default function DoencasClient({
  episodes,
  activeEpisodes,
  recoveredEpisodes,
  isReadonly,
  today,
  success,
  error: errorMsg,
  updateAction,
  addEvolutionAction,
}: Props) {
  const { t } = useI18n();

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatShortDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  }

  function daysBetween(start: string, end: string) {
    const s = new Date(start + "T12:00:00").getTime();
    const e = new Date(end + "T12:00:00").getTime();
    return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
  }

  function daysActive(start: string) {
    const s = new Date(start + "T12:00:00").getTime();
    const tTime = new Date(today + "T12:00:00").getTime();
    return Math.max(1, Math.ceil((tTime - s) / (1000 * 60 * 60 * 24)));
  }

  function getEvolutionTrend(notes: string | null | undefined): { label: string; icon: string; color: string } {
    if (!notes) return { label: t("health.stableEvolution"), icon: "➡️", color: "bg-gray-100 text-gray-600" };
    const lines = notes.split("\n").filter(Boolean).slice(0, 3);
    if (lines.length === 0) return { label: t("health.stableEvolution"), icon: "➡️", color: "bg-gray-100 text-gray-600" };
    const positiveWords = /melhorou|sem febre/i;
    const negativeWords = /piorou|febre|vomito|vômito/i;
    const lastLine = lines[0];
    if (positiveWords.test(lastLine) && !negativeWords.test(lastLine)) return { label: t("health.improving"), icon: "📈", color: "bg-green-100 text-green-700" };
    if (negativeWords.test(lastLine) && !positiveWords.test(lastLine)) return { label: t("health.worsening"), icon: "📉", color: "bg-red-100 text-red-700" };
    return { label: t("health.stableEvolution"), icon: "➡️", color: "bg-gray-100 text-gray-600" };
  }

  function getSeverityBadge(severity: string | null) {
    switch (severity) {
      case "grave": return { label: t("health.severityGrave"), color: "bg-red-100 text-red-700", icon: "🔴" };
      case "moderado": return { label: t("health.severityModerate"), color: "bg-amber-100 text-amber-700", icon: "🟡" };
      default: return { label: t("health.severityMild"), color: "bg-green-100 text-green-700", icon: "🟢" };
    }
  }

  function getCreatorName(ep: Episode) {
    const profile = (Array.isArray(ep.profiles) ? ep.profiles[0] : ep.profiles) ?? null;
    if (!profile?.full_name) return null;
    return getDisplayName(profile.full_name, true);
  }

  function getChildName(ep: Episode): string | null | undefined {
    const child = (Array.isArray(ep.children) ? ep.children[0] : ep.children) ?? null;
    return child?.full_name;
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark" aria-label={t("health.backToHealth")}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("health.illnessHistory")}</h1>
          <p className="text-sm text-muted">
            {t("health.episodesRegistered", { count: episodes.length })}
          </p>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(success)}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {/* Active Episodes */}
      {activeEpisodes.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
            {t("health.activeEpisodes")} ({activeEpisodes.length})
          </h2>
          <div className="space-y-3">
            {activeEpisodes.map((ep) => {
              const sev = getSeverityBadge(ep.severity);
              const creator = getCreatorName(ep);
              const days = daysActive(ep.start_date);
              const trend = getEvolutionTrend(ep.notes);

              return (
                <div key={ep.id} className="bg-white rounded-xl shadow-sm border-l-4 border-red-400 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-bold text-dark">{ep.title}</h3>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sev.color}`}>
                            {sev.icon} {sev.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted">
                          {getChildName(ep)} &middot; {formatShortDate(ep.start_date)} &middot; {days} {t("health.days").toLowerCase()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                          <span className="text-[10px]" aria-hidden="true">●</span> {t("health.active")}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${trend.color}`}>
                          {trend.icon} {trend.label}
                        </span>
                      </div>
                    </div>

                    {ep.symptoms && ep.symptoms.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {ep.symptoms.map((s: string, i: number) => (
                          <span key={i} className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 text-xs">{s}</span>
                        ))}
                      </div>
                    )}

                    {ep.hospital_visit && (
                      <div className="flex items-center gap-1.5 mb-2 text-xs text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5 w-fit">
                        <span>🏥</span>
                        <span className="font-medium">
                          {t("health.hospital")}{ep.hospital_name ? `: ${ep.hospital_name}` : ""}
                          {ep.hospital_date ? ` em ${formatShortDate(ep.hospital_date)}` : ""}
                        </span>
                      </div>
                    )}

                    {ep.diagnosis && (
                      <p className="text-xs text-muted mb-2">
                        <span className="font-medium">{t("health.diagnosis")}:</span> {ep.diagnosis}
                      </p>
                    )}

                    {ep.notes && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">{t("health.evolution")}:</p>
                        {ep.notes.split("\n").filter(Boolean).slice(0, 5).map((line: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                            <p className="text-[11px] text-dark/80">{line}</p>
                          </div>
                        ))}
                        {ep.notes.split("\n").filter(Boolean).length > 5 && (
                          <p className="text-[10px] text-muted">{t("health.previousUpdates", { count: ep.notes.split("\n").filter(Boolean).length - 5 })}</p>
                        )}
                      </div>
                    )}

                    {creator && (
                      <p className="text-[11px] text-muted/70 mt-2">
                        {t("health.registeredByOn", { name: creator, date: formatDate(ep.created_at?.split("T")[0] || ep.start_date) })}
                      </p>
                    )}
                  </div>

                  {!isReadonly && (
                    <div className="border-t border-gray-100">
                      <UpdateEpisodeForm episodeId={ep.id} updateAction={addEvolutionAction} />
                      <div className="border-t border-gray-100">
                        <ResolveButton episodeId={ep.id} today={today} action={updateAction} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recovered Episodes */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-dark mb-3 px-1 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full" />
          {t("health.recovered")} ({recoveredEpisodes.length})
        </h2>
        {recoveredEpisodes.length > 0 ? (
          <div className="space-y-3">
            {recoveredEpisodes.map((ep) => {
              const sev = getSeverityBadge(ep.severity);
              const creator = getCreatorName(ep);
              return (
                <div key={ep.id} className="bg-white/80 rounded-xl p-4 shadow-sm border-l-4 border-green-400">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-dark">{ep.title}</h3>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sev.color}`}>
                          {sev.icon} {sev.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {getChildName(ep)} &middot; {formatShortDate(ep.start_date)}
                        {ep.end_date && (
                          <> &rarr; {formatShortDate(ep.end_date)} ({daysBetween(ep.start_date, ep.end_date)} {t("health.days").toLowerCase()})</>
                        )}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full flex-shrink-0">
                      ✓ {t("health.recoveredLabel")}
                    </span>
                  </div>

                  {ep.symptoms && ep.symptoms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {ep.symptoms.map((s: string, i: number) => (
                        <span key={i} className="bg-gray-100 text-gray-500 rounded-full px-2.5 py-0.5 text-xs">{s}</span>
                      ))}
                    </div>
                  )}

                  {ep.hospital_visit && (
                    <div className="flex items-center gap-1.5 mb-1 text-xs text-gray-500">
                      <span>🏥</span>
                      <span>{t("health.hospital")}{ep.hospital_name ? `: ${ep.hospital_name}` : ""}</span>
                    </div>
                  )}

                  {ep.diagnosis && (
                    <p className="text-xs text-muted">
                      <span className="font-medium">{t("health.diagnosis")}:</span> {ep.diagnosis}
                    </p>
                  )}

                  {creator && (
                    <p className="text-[11px] text-muted/70 mt-1">
                      {t("health.registeredBy", { name: creator })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-8 shadow-sm text-center">
            <p className="text-4xl mb-3" aria-hidden="true">💪</p>
            <p className="text-muted text-sm mb-1">{t("health.noRecoveredEpisode")}</p>
            <p className="text-muted text-xs">{t("health.resolvedEpisodesAppear")}</p>
          </div>
        )}
      </section>

      {(!episodes || episodes.length === 0) && (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center mb-6">
          <p className="text-4xl mb-3">🤒</p>
          <p className="text-muted text-sm mb-1">{t("health.noIllnessEpisode")}</p>
          <p className="text-muted text-xs">{t("health.registerEpisodesToTrack")}</p>
        </div>
      )}

      {!isReadonly && (
        <Link
          href="/saude/doencas/nova"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 px-5 py-3 bg-accent text-white text-sm font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("health.registerEpisode")}
        </Link>
      )}
    </div>
  );
}
