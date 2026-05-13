"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { createSchoolLog, deleteSchoolLog, updateSchoolLog, toggleSchoolLogCompleted, markSchoolLogRead } from "@/actions/school";
import { getDisplayName } from "@/lib/constants";
import { trackEvent, EVENTS } from "@/lib/analytics";
// Import from school-shared (client-safe) — `@/lib/services/school` is
// server-only and would pull next/headers + Node crypto into this bundle.
import {
  EVENT_SUBTYPES,
  NOTE_SUBTYPES,
  type SchoolSubtype,
  type SchoolKind,
  type SchoolPriority,
  getKind,
} from "@/lib/services/school-shared";

/* ─── Types ─────────────────────────────────────────────────────── */

interface Child {
  id: string;
  full_name: string;
}

interface SchoolLog {
  id: string;
  child_id: string | null;
  title: string;
  description: string | null;
  log_type: string;
  log_date: string;
  completed: boolean;
  logged_by: string;
  subject: string | null;
  score: string | null;
  priority: SchoolPriority;
  event_time: string | null;
  children: { full_name?: string } | null;
  profiles: { full_name?: string } | null;
}

interface ReadReceipt {
  log_id: string;
  user_id: string;
  read_at: string;
}

interface EscolaClientProps {
  groupId: string;
  isReadonly: boolean;
  currentUserId: string;
  childrenList: Child[];
  logs: SchoolLog[];
  reads: ReadReceipt[];
  today: string;
}

/* ─── Priority metadata ─────────────────────────────────────────── */

// Visual config — labels come from i18n at render time via t(...).
const PRIORITY_META: Record<SchoolPriority, { i18nKey: string; chipBg: string; chipText: string; borderColor: string; rank: number }> = {
  info:      { i18nKey: "collab.priorityInfo",      chipBg: "bg-gray-100",   chipText: "text-gray-600",  borderColor: "border-transparent",      rank: 0 },
  important: { i18nKey: "collab.priorityImportant", chipBg: "bg-amber-100",  chipText: "text-amber-800", borderColor: "border-amber-300",        rank: 1 },
  urgent:    { i18nKey: "collab.priorityUrgent",    chipBg: "bg-red-100",    chipText: "text-red-700",   borderColor: "border-red-400",          rank: 2 },
};

function formatReadAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/* ─── Subtype metadata (single source for icon + label) ─────────── */

const SUBTYPE_META: Record<SchoolSubtype, { icon: string; label: string; hint?: string }> = {
  // Events — go to calendar
  exam:        { icon: "📚", label: "Prova", hint: "Matéria, data, nota (opcional)" },
  meeting:     { icon: "👥", label: "Reunião", hint: "Reunião de pais, conselho" },
  event:       { icon: "🎉", label: "Evento escolar", hint: "Festa, formatura, gincana" },
  homework:    { icon: "📝", label: "Tarefa", hint: "Lição com prazo" },
  absence:     { icon: "🚫", label: "Falta", hint: "Ausência registrada" },
  // Notes — only history
  grade:       { icon: "📊", label: "Nota / boletim" },
  behavior:    { icon: "📋", label: "Comportamento" },
  achievement: { icon: "🏆", label: "Conquista" },
  concern:     { icon: "⚠️", label: "Atenção" },
  other:       { icon: "📌", label: "Outro" },
};

type ComposerState =
  | { stage: "closed" }
  | { stage: "pick-kind" }
  | { stage: "pick-subtype"; kind: SchoolKind }
  | { stage: "form"; subtype: SchoolSubtype };

/* ─── Component ─────────────────────────────────────────────────── */

export default function EscolaClient({ groupId, isReadonly, currentUserId, childrenList, logs, reads, today }: EscolaClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [editingLog, setEditingLog] = useState<SchoolLog | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState>({ stage: "closed" });
  const [filterKind, setFilterKind] = useState<"all" | SchoolKind>("all");
  // Optimistic read state: when user opens a card, we mark it read locally
  // before the server confirms. Survives reload because the server-rendered
  // reads array is the source of truth — this only avoids the flicker.
  const [optimisticReads, setOptimisticReads] = useState<Set<string>>(new Set());
  // Expanded cards — clicking a card expands it AND marks it read.
  const [expandedId, setExpandedId] = useState<string | null>(highlightId);

  // Push deep link (?highlight=<id>) → user explicitly opened this record
  // by tapping a notification. Treat that as "open detail":
  //   1. Fire `notification_opened` (funnel metric)
  //   2. Mark as read (the tap IS the explicit intent — same rule as
  //      tap-to-expand on the list). If the user just lands on /escola
  //      via menu without ?highlight=, nothing is marked.
  // Single-shot per highlightId. setState inside effect is intentional —
  // optimistic read state must apply before the next paint, otherwise the
  // "Novo" badge flickers between mount and the server-side revalidation.
  useEffect(() => {
    if (!highlightId) return;
    trackEvent(EVENTS.NOTIFICATION_OPENED, { record_type: "school_log", record_id: highlightId });
    const target = logs.find((l) => l.id === highlightId);
    if (target && isUnread(target)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptimisticReads((prev) => new Set(prev).add(highlightId));
      void markSchoolLogRead(highlightId);
    }
    // logs / isUnread intentionally omitted: this must run exactly once per
    // highlightId arrival, not on every re-render after reads update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  // Index reads by log_id for O(1) lookup. Group by log so we can show
  // a per-log list of "Visto por X · Y".
  const readsByLog = useMemo(() => {
    const map = new Map<string, ReadReceipt[]>();
    for (const r of reads) {
      const arr = map.get(r.log_id) || [];
      arr.push(r);
      map.set(r.log_id, arr);
    }
    return map;
  }, [reads]);

  function isUnread(log: SchoolLog): boolean {
    if (optimisticReads.has(log.id)) return false;
    const logReads = readsByLog.get(log.id) || [];
    return !logReads.some((r) => r.user_id === currentUserId);
  }

  function coparentReaders(log: SchoolLog): ReadReceipt[] {
    const logReads = readsByLog.get(log.id) || [];
    return logReads.filter((r) => r.user_id !== currentUserId);
  }

  // Mark-as-read: only fires when user explicitly opens a card. Per
  // CLAUDE.md "Collaborative Records" — never on mount/scroll/preload.
  function handleOpenCard(log: SchoolLog) {
    const wasExpanded = expandedId === log.id;
    setExpandedId(wasExpanded ? null : log.id);
    if (wasExpanded) return; // closing = nothing to mark
    if (isUnread(log)) {
      setOptimisticReads((prev) => new Set(prev).add(log.id));
      // Server-side: fire-and-forget. revalidatePath in the action
      // refreshes the dashboard badge on next nav.
      void markSchoolLogRead(log.id);
    }
  }

  /* ─ Composer flow ────────────────────────────────────────────── */

  function openComposer() {
    setComposer({ stage: "pick-kind" });
  }
  function closeComposer() {
    setComposer({ stage: "closed" });
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    try {
      await createSchoolLog(formData);
    } catch {
      // server-action redirect throws — expected
    } finally {
      setSubmitting(false);
      setComposer({ stage: "closed" });
    }
  }

  async function handleEditSubmit(formData: FormData) {
    setSubmitting(true);
    try {
      await updateSchoolLog(formData);
    } catch {
      // server-action redirect throws — expected
    } finally {
      setSubmitting(false);
      setEditingLog(null);
    }
  }

  async function handleToggleCompleted(logId: string) {
    startTransition(async () => {
      await toggleSchoolLogCompleted(logId);
      router.refresh();
    });
  }

  /* ─ Filtered + sorted list ───────────────────────────────────── */

  // Sort: unread first → highest priority next → newest date last.
  // Inside each tier, preserve the input order (which is already date DESC
  // from the page query). This matches the "premium feed" feeling — what
  // needs attention is at the top, but you can still browse by date below.
  const filteredLogs = useMemo(() => {
    const base = logs.filter((l) => {
      if (filterKind === "all") return true;
      return getKind(l.log_type as SchoolSubtype) === filterKind;
    });
    return [...base].sort((a, b) => {
      const unreadA = isUnread(a) ? 1 : 0;
      const unreadB = isUnread(b) ? 1 : 0;
      if (unreadA !== unreadB) return unreadB - unreadA;
      const prioA = PRIORITY_META[a.priority]?.rank ?? 0;
      const prioB = PRIORITY_META[b.priority]?.rank ?? 0;
      if (prioA !== prioB) return prioB - prioA;
      return b.log_date.localeCompare(a.log_date);
    });
    // isUnread depends on optimisticReads + readsByLog — re-sort when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, filterKind, optimisticReads, readsByLog]);

  const unreadCount = useMemo(() => logs.filter(isUnread).length, [logs, optimisticReads, readsByLog]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-dark">{t("nav.school")}</h1>
            {unreadCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#C07055] text-white text-[11px] font-bold leading-none"
                aria-label={`${unreadCount} ${unreadCount === 1 ? "registro novo" : "registros novos"}`}
              >
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-sm text-muted mt-1">{t("schoolPage.subtitle")}</p>
        </div>
        {!isReadonly && childrenList.length > 0 && (
          <button
            type="button"
            onClick={openComposer}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#2E7268] text-white text-sm font-semibold rounded-full shadow-sm hover:bg-[#1F5A52] transition-colors"
          >
            <span className="text-lg leading-none">+</span> Novo
          </button>
        )}
      </div>

      {/* Empty state for no children */}
      {!isReadonly && childrenList.length === 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm text-center">
          <p className="text-3xl mb-2">🎒</p>
          <p className="text-sm text-dark font-medium">{t("schoolPage.registerChildFirst")}</p>
          <Link href="/criancas/nova" className="inline-block mt-3 px-4 py-2 bg-[#2E7268] text-white text-sm font-semibold rounded-lg hover:bg-[#1F5A52]">
            {t("family.addChild")}
          </Link>
        </div>
      )}

      {/* Filter tabs */}
      {logs.length > 0 && (
        <div className="flex gap-2 -mb-2">
          <FilterChip active={filterKind === "all"}     onClick={() => setFilterKind("all")}   label="Tudo" />
          <FilterChip active={filterKind === "event"}   onClick={() => setFilterKind("event")} label="📅 Eventos" />
          <FilterChip active={filterKind === "note"}    onClick={() => setFilterKind("note")}  label="📝 Registros" />
        </div>
      )}

      {/* List */}
      {filteredLogs.length > 0 ? (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const subtype = log.log_type as SchoolSubtype;
            const meta = SUBTYPE_META[subtype] || SUBTYPE_META.other;
            const kind = getKind(subtype);
            const isDeleting = deleteConfirmId === log.id;
            const isHomework = subtype === "homework";
            const unread = isUnread(log);
            const expanded = expandedId === log.id;
            const highlighted = highlightId === log.id;
            const priorityMeta = PRIORITY_META[log.priority] || PRIORITY_META.info;
            const readers = coparentReaders(log);

            return (
              <div
                key={log.id}
                onClick={() => handleOpenCard(log)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpenCard(log);
                  }
                }}
                className={[
                  "rounded-xl p-4 shadow-sm transition-all cursor-pointer border-l-4 outline-none",
                  unread ? "bg-[#FFF8F4]" : "bg-white",
                  unread ? "border-[#C07055]" : priorityMeta.borderColor,
                  log.completed ? "opacity-60" : "",
                  highlighted ? "ring-2 ring-[#C07055] ring-offset-2" : "",
                  "hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#2E7268]",
                ].join(" ")}
              >
                <div className="flex items-start gap-3">
                  {isHomework && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleToggleCompleted(log.id); }}
                      disabled={isPending}
                      className="mt-1 flex-shrink-0"
                      aria-label="Marcar tarefa"
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        log.completed ? "bg-[#2E7268] border-[#2E7268]" : "border-gray-300 hover:border-[#C07055]"
                      }`}>
                        {log.completed && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg flex-shrink-0">{meta.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className={`font-medium text-dark text-sm ${log.completed ? "line-through" : ""}`}>
                              {log.title}
                            </h4>
                            {unread && (
                              <span className="text-[10px] font-bold text-white bg-[#C07055] px-1.5 py-0.5 rounded-full">
                                {t("collab.new")}
                              </span>
                            )}
                            {log.priority !== "info" && (
                              <span className={`text-[10px] font-bold ${priorityMeta.chipBg} ${priorityMeta.chipText} px-1.5 py-0.5 rounded-full uppercase tracking-wide`}>
                                {t(priorityMeta.i18nKey)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted truncate">
                            {meta.label}
                            {log.subject ? ` · ${log.subject}` : ""}
                            {log.children?.full_name ? ` · ${log.children.full_name}` : ""}
                            {kind === "event" ? " · 📅 no calendário" : ""}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-muted flex-shrink-0">{new Date(log.log_date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                    </div>
                    {log.score && (
                      <p className="text-xs font-medium text-[#2E7268] ml-8 mt-1">Nota: {log.score}</p>
                    )}
                    {(expanded || !log.description || log.description.length <= 140) && log.description && (
                      <p className="text-sm text-muted mt-1.5 ml-8 whitespace-pre-wrap">{log.description}</p>
                    )}
                    {!expanded && log.description && log.description.length > 140 && (
                      <p className="text-sm text-muted mt-1.5 ml-8 line-clamp-2">{log.description}</p>
                    )}
                    <p className="text-xs text-muted mt-1 ml-8">Por {getDisplayName(log.profiles?.full_name) || "Usuario"}</p>
                    {/* Read receipts — only visible when expanded, and only
                        when at least one coparent has read. Keep it discreet,
                        WhatsApp-style. */}
                    {expanded && readers.length > 0 && (
                      <div className="mt-2 ml-8 flex flex-wrap gap-x-3 gap-y-0.5">
                        {readers.map((r) => (
                          <span key={r.user_id} className="text-[11px] text-[#2E7268]">
                            ✓ {t("collab.seen")} · {formatReadAt(r.read_at)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {!isReadonly && expanded && (
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100 ml-8" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => setEditingLog(log)} className="text-[11px] text-[#C07055] font-medium hover:underline">Editar</button>
                    {isDeleting ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-red-500">Excluir?</span>
                        <form action={deleteSchoolLog}>
                          <input type="hidden" name="logId" value={log.id} />
                          <button type="submit" className="text-[11px] text-red-600 font-bold hover:underline">Sim</button>
                        </form>
                        <button type="button" onClick={() => setDeleteConfirmId(null)} className="text-[11px] text-gray-400 hover:underline">Não</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setDeleteConfirmId(log.id)} className="text-[11px] text-red-400 font-medium hover:underline">Excluir</button>
                    )}
                    {isHomework && log.completed && (
                      <span className="ml-auto text-[10px] font-bold text-[#2E7268] px-2 py-0.5 bg-[#2E7268]/10 rounded-full">Concluído</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : logs.length > 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center text-sm text-muted">
          Nenhum item neste filtro.
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-3xl mb-2">📚</p>
          <p className="text-dark font-medium">{t("schoolPage.noLogs")}</p>
          <p className="text-sm text-muted mt-1">Toque em <strong>+ Novo</strong> para criar uma prova, reunião ou registro.</p>
        </div>
      )}

      {/* ─── COMPOSER MODAL ──────────────────────────────────────── */}
      {composer.stage !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 p-0 sm:p-4" onClick={closeComposer}>
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {composer.stage === "pick-kind" && (
              <PickKindStep onPick={(k) => setComposer({ stage: "pick-subtype", kind: k })} onClose={closeComposer} />
            )}
            {composer.stage === "pick-subtype" && (
              <PickSubtypeStep
                kind={composer.kind}
                onPick={(s) => setComposer({ stage: "form", subtype: s })}
                onBack={() => setComposer({ stage: "pick-kind" })}
                onClose={closeComposer}
              />
            )}
            {composer.stage === "form" && (
              <FormStep
                subtype={composer.subtype}
                groupId={groupId}
                childrenList={childrenList}
                today={today}
                submitting={submitting}
                onSubmit={handleSubmit}
                onBack={() => setComposer({ stage: "pick-subtype", kind: getKind(composer.subtype) })}
                onClose={closeComposer}
              />
            )}
          </div>
        </div>
      )}

      {/* ─── EDIT MODAL ──────────────────────────────────────────── */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 p-0 sm:p-4" onClick={() => setEditingLog(null)}>
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <EditFormStep
              log={editingLog}
              childrenList={childrenList}
              submitting={submitting}
              onSubmit={handleEditSubmit}
              onClose={() => setEditingLog(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────── */

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
        active ? "bg-[#2E7268] text-white" : "bg-white text-muted hover:text-dark"
      }`}
    >
      {label}
    </button>
  );
}

function PickKindStep({ onPick, onClose }: { onPick: (k: SchoolKind) => void; onClose: () => void }) {
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-dark">O que você quer registrar?</h3>
        <button type="button" onClick={onClose} className="text-muted hover:text-dark text-xl leading-none">×</button>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <KindCard
          icon="📅"
          title="Evento"
          description="Algo que acontece em uma data"
          example="Ex: prova, reunião, tarefa, evento"
          accent="bg-[#C07055]/10 border-[#C07055]/30 hover:bg-[#C07055]/20"
          onClick={() => onPick("event")}
        />
        <KindCard
          icon="📝"
          title="Registro"
          description="Uma informação sobre a escola"
          example="Ex: nota, comportamento, conquista"
          accent="bg-[#2E7268]/10 border-[#2E7268]/30 hover:bg-[#2E7268]/20"
          onClick={() => onPick("note")}
        />
      </div>
    </div>
  );
}

function KindCard({
  icon, title, description, example, accent, onClick,
}: {
  icon: string; title: string; description: string; example: string; accent: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left ${accent}`}
    >
      <span className="text-4xl flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-dark">{title}</div>
        <div className="text-sm text-muted">{description}</div>
        <div className="text-xs text-muted mt-1 italic">{example}</div>
      </div>
      <span className="text-xl text-muted flex-shrink-0">›</span>
    </button>
  );
}

function PickSubtypeStep({
  kind, onPick, onBack, onClose,
}: {
  kind: SchoolKind; onPick: (s: SchoolSubtype) => void; onBack: () => void; onClose: () => void;
}) {
  const list = kind === "event" ? EVENT_SUBTYPES : NOTE_SUBTYPES;
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={onBack} className="text-sm text-[#C07055] hover:underline">‹ Voltar</button>
        <h3 className="text-lg font-bold text-dark">{kind === "event" ? "📅 Que tipo de evento?" : "📝 Que tipo de registro?"}</h3>
        <button type="button" onClick={onClose} className="text-muted hover:text-dark text-xl leading-none">×</button>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {list.map((s) => {
          const m = SUBTYPE_META[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-transparent hover:border-gray-200 text-left transition-colors"
            >
              <span className="text-2xl flex-shrink-0">{m.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-dark text-sm">{m.label}</div>
                {m.hint && <div className="text-xs text-muted">{m.hint}</div>}
              </div>
              <span className="text-muted">›</span>
            </button>
          );
        })}
      </div>
      {kind === "event" && (
        <div className="mt-3 p-3 bg-[#C07055]/5 border border-[#C07055]/20 rounded-lg">
          <p className="text-xs text-[#C07055] font-medium">📅 Eventos vão automaticamente para o calendário da família.</p>
        </div>
      )}
    </div>
  );
}

function FormStep({
  subtype, groupId, childrenList, today, submitting, onSubmit, onBack, onClose,
}: {
  subtype: SchoolSubtype;
  groupId: string;
  childrenList: Child[];
  today: string;
  submitting: boolean;
  onSubmit: (fd: FormData) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const meta = SUBTYPE_META[subtype];
  const kind = getKind(subtype);
  const isExam = subtype === "exam";

  return (
    <form action={onSubmit} className="p-5 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={onBack} className="text-sm text-[#C07055] hover:underline">‹ Voltar</button>
        <h3 className="text-lg font-bold text-dark flex items-center gap-2">
          <span>{meta.icon}</span> {meta.label}
        </h3>
        <button type="button" onClick={onClose} className="text-muted hover:text-dark text-xl leading-none">×</button>
      </div>

      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="subtype" value={subtype} />

      <div>
        <label className="block text-xs font-medium text-dark mb-1">Criança</label>
        <select name="childId" required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30">
          {childrenList.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      </div>

      {isExam && (
        <div>
          <label className="block text-xs font-medium text-dark mb-1">Matéria</label>
          <input type="text" name="subject" required placeholder="Ex: Matemática"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-dark mb-1">{isExam ? "Conteúdo / Tópico" : "Título"}</label>
        <input type="text" name="title" required
          placeholder={isExam ? "Ex: Trigonometria + funções" : `Ex: ${meta.label}`}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-dark mb-1">Data</label>
          <input type="date" name="logDate" defaultValue={today} required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
        </div>
        {kind === "event" && (
          <div>
            <label className="block text-xs font-medium text-dark mb-1">Horário (opcional)</label>
            <input type="time" name="eventTime"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
          </div>
        )}
      </div>

      {isExam && (
        <div>
          <label className="block text-xs font-medium text-dark mb-1">Nota (opcional — preencha após a prova)</label>
          <input type="text" name="score" placeholder='Ex: "8,5" ou "B+"'
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-dark mb-1">Observação (opcional)</label>
        <textarea name="description" rows={2}
          placeholder="Detalhes adicionais"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
      </div>

      <div>
        <label className="block text-xs font-medium text-dark mb-1">{t("collab.priorityLabel")}</label>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("collab.priorityLabel")}>
          {(["info", "important", "urgent"] as const).map((p, i) => (
            <label key={p} className="cursor-pointer">
              <input type="radio" name="priority" value={p} defaultChecked={i === 0} className="peer sr-only" />
              <div className="text-center px-2 py-2 rounded-lg border text-xs font-medium border-gray-200 peer-checked:border-[#2E7268] peer-checked:bg-[#2E7268]/10 peer-checked:text-[#2E7268] text-gray-600">
                {t(`collab.priority${p.charAt(0).toUpperCase() + p.slice(1)}`)}
              </div>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-1">{t("collab.priorityUrgentHint")}</p>
      </div>

      {kind === "event" && (
        <div className="p-3 bg-[#C07055]/5 border border-[#C07055]/20 rounded-lg">
          <p className="text-xs text-[#C07055] font-medium">📅 Este item será adicionado ao calendário automaticamente.</p>
        </div>
      )}

      <button type="submit" disabled={submitting}
        className="w-full py-2.5 bg-[#2E7268] text-white text-sm font-semibold rounded-lg hover:bg-[#1F5A52] transition-colors disabled:opacity-50">
        {submitting ? "Salvando..." : "Registrar"}
      </button>
    </form>
  );
}

/**
 * Edit a school log — full form mirroring the create form. The user can
 * change subtype (which triggers a kind transition: note↔event creates or
 * removes the calendar mirror), child, date, time, subject, score, title,
 * description. The service handles the calendar mirror sync.
 */
function EditFormStep({
  log, childrenList, submitting, onSubmit, onClose,
}: {
  log: SchoolLog;
  childrenList: Child[];
  submitting: boolean;
  onSubmit: (fd: FormData) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [subtype, setSubtype] = useState<SchoolSubtype>(log.log_type as SchoolSubtype);
  const meta = SUBTYPE_META[subtype] || SUBTYPE_META.other;
  const kind = getKind(subtype);
  const isExam = subtype === "exam";
  const wasEvent = getKind(log.log_type as SchoolSubtype) === "event";

  return (
    <form action={onSubmit} className="p-5 space-y-3 max-h-[92vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-dark flex items-center gap-2">
          <span>{meta.icon}</span> Editar {meta.label.toLowerCase()}
        </h3>
        <button type="button" onClick={onClose} className="text-muted hover:text-dark text-xl leading-none">×</button>
      </div>

      <input type="hidden" name="logId" value={log.id} />
      <input type="hidden" name="subtype" value={subtype} />

      <div>
        <label className="block text-xs font-medium text-dark mb-1">Tipo</label>
        <div className="flex flex-wrap gap-1.5">
          {[...EVENT_SUBTYPES, ...NOTE_SUBTYPES].map((s) => {
            const m = SUBTYPE_META[s];
            const active = subtype === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSubtype(s)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? "bg-[#2E7268] text-white border-[#2E7268]"
                    : "bg-white text-dark border-gray-200 hover:border-[#2E7268]/40"
                }`}
              >
                {m.icon} {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-dark mb-1">Criança</label>
        <select name="childId" required defaultValue={log.child_id || ""}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30">
          {childrenList.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      </div>

      {isExam && (
        <div>
          <label className="block text-xs font-medium text-dark mb-1">Matéria</label>
          <input type="text" name="subject" required defaultValue={log.subject || ""} placeholder="Ex: Matemática"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-dark mb-1">{isExam ? "Conteúdo / Tópico" : "Título"}</label>
        <input type="text" name="title" required defaultValue={log.title}
          placeholder={isExam ? "Ex: Trigonometria + funções" : `Ex: ${meta.label}`}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-dark mb-1">Data</label>
          <input type="date" name="logDate" defaultValue={log.log_date} required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
        </div>
        {kind === "event" && (
          <div>
            <label className="block text-xs font-medium text-dark mb-1">Horário (opcional)</label>
            <input type="time" name="eventTime" defaultValue={log.event_time ? log.event_time.slice(0, 5) : ""}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
          </div>
        )}
      </div>

      {isExam && (
        <div>
          <label className="block text-xs font-medium text-dark mb-1">Nota (opcional)</label>
          <input type="text" name="score" defaultValue={log.score || ""} placeholder='Ex: "8,5" ou "B+"'
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-dark mb-1">Observação (opcional)</label>
        <textarea name="description" rows={2} defaultValue={log.description || ""}
          placeholder="Detalhes adicionais"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30" />
      </div>

      <div>
        <label className="block text-xs font-medium text-dark mb-1">{t("collab.priorityLabel")}</label>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("collab.priorityLabel")}>
          {(["info", "important", "urgent"] as const).map((p) => (
            <label key={p} className="cursor-pointer">
              <input type="radio" name="priority" value={p} defaultChecked={log.priority === p} className="peer sr-only" />
              <div className="text-center px-2 py-2 rounded-lg border text-xs font-medium border-gray-200 peer-checked:border-[#2E7268] peer-checked:bg-[#2E7268]/10 peer-checked:text-[#2E7268] text-gray-600">
                {t(`collab.priority${p.charAt(0).toUpperCase() + p.slice(1)}`)}
              </div>
            </label>
          ))}
        </div>
      </div>

      {kind === "event" ? (
        <div className="p-3 bg-[#C07055]/5 border border-[#C07055]/20 rounded-lg">
          <p className="text-xs text-[#C07055] font-medium">📅 Aparece no calendário na nova data{wasEvent ? "" : " (será adicionado agora)"}.</p>
        </div>
      ) : wasEvent ? (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700 font-medium">⚠️ Vai ser removido do calendário (virou um registro).</p>
        </div>
      ) : null}

      <button type="submit" disabled={submitting}
        className="w-full py-2.5 bg-[#2E7268] text-white text-sm font-semibold rounded-lg hover:bg-[#1F5A52] transition-colors disabled:opacity-50">
        {submitting ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
