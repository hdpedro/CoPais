"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { createSchoolLog, deleteSchoolLog, updateSchoolLog, toggleSchoolLogCompleted } from "@/actions/school";
import { getDisplayName } from "@/lib/constants";
import {
  EVENT_SUBTYPES,
  NOTE_SUBTYPES,
  type SchoolSubtype,
  type SchoolKind,
  getKind,
} from "@/lib/services/school";

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
  event_time: string | null;
  children: { full_name?: string } | null;
  profiles: { full_name?: string } | null;
}

interface EscolaClientProps {
  groupId: string;
  isReadonly: boolean;
  childrenList: Child[];
  logs: SchoolLog[];
  today: string;
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

export default function EscolaClient({ groupId, isReadonly, childrenList, logs, today }: EscolaClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [editingLog, setEditingLog] = useState<SchoolLog | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState>({ stage: "closed" });
  const [filterKind, setFilterKind] = useState<"all" | SchoolKind>("all");

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

  /* ─ Filtered list ────────────────────────────────────────────── */

  const filteredLogs = logs.filter((l) => {
    if (filterKind === "all") return true;
    return getKind(l.log_type as SchoolSubtype) === filterKind;
  });

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("nav.school")}</h1>
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

            return (
              <div key={log.id} className={`bg-white rounded-xl p-4 shadow-sm transition-all ${log.completed ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  {isHomework && (
                    <button
                      type="button"
                      onClick={() => handleToggleCompleted(log.id)}
                      disabled={isPending}
                      className="mt-1 flex-shrink-0"
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
                          <h4 className={`font-medium text-dark text-sm truncate ${log.completed ? "line-through" : ""}`}>{log.title}</h4>
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
                    {log.description && <p className="text-sm text-muted mt-1.5 ml-8">{log.description}</p>}
                    <p className="text-xs text-muted mt-1 ml-8">Por {getDisplayName(log.profiles?.full_name) || "Usuario"}</p>
                  </div>
                </div>

                {!isReadonly && (
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-50 ml-8">
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
