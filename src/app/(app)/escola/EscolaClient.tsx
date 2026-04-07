"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { createSchoolLog, deleteSchoolLog, updateSchoolLog, toggleSchoolLogCompleted } from "@/actions/school";
import { getDisplayName } from "@/lib/constants";

interface Child {
  id: string;
  full_name: string;
}

interface SchoolLog {
  id: string;
  title: string;
  description: string | null;
  log_type: string;
  log_date: string;
  completed: boolean;
  logged_by: string;
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

export default function EscolaClient({ groupId, isReadonly, childrenList, logs, today }: EscolaClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const typeLabels: Record<string, string> = {
    grade: t("schoolPage.typeGrade"),
    meeting: t("schoolPage.typeMeeting"),
    behavior: t("schoolPage.typeBehavior"),
    homework: t("schoolPage.typeHomework"),
    event: t("schoolPage.typeEvent"),
    absence: t("schoolPage.typeAbsence"),
    achievement: t("schoolPage.typeAchievement"),
    concern: t("schoolPage.typeConcern"),
    other: t("schoolPage.typeOther"),
  };

  const typeIcons: Record<string, string> = {
    grade: "\u{1F4CA}",
    meeting: "\u{1F465}",
    behavior: "\u{1F4DD}",
    homework: "\u{1F4DA}",
    event: "\u{1F389}",
    absence: "\u{1F6AB}",
    achievement: "\u{1F3C6}",
    concern: "\u26A0\uFE0F",
    other: "\u{1F4CC}",
  };

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    try {
      await createSchoolLog(formData);
    } catch {
      // redirect throws
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleCompleted(logId: string) {
    startTransition(async () => {
      await toggleSchoolLogCompleted(logId);
      router.refresh();
    });
  }

  function startEdit(log: SchoolLog) {
    setEditingId(log.id);
    setEditTitle(log.title);
    setEditDesc(log.description || "");
  }

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-dark">{t("nav.school")}</h1>
        <p className="text-sm text-muted mt-1">{t("schoolPage.subtitle")}</p>
      </div>

      {/* New School Log Form */}
      {!isReadonly && (!childrenList || childrenList.length === 0) && (
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-muted text-sm">{t("schoolPage.registerChildFirst")}</p>
          <Link href="/criancas/nova" className="text-primary font-medium text-sm mt-2 inline-block">{t("family.addChild")}</Link>
        </div>
      )}
      {!isReadonly && childrenList && childrenList.length > 0 && (
        <form action={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-dark">{t("schoolPage.newLog")}</h3>
          <input type="hidden" name="groupId" value={groupId} />

          <div className="grid grid-cols-2 gap-3">
            <select name="childId" required
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">{t("schoolPage.childPlaceholder")}</option>
              {childrenList?.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
            <select name="logType" required
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">{t("schoolPage.typePlaceholder")}</option>
              {Object.entries(typeLabels).map(([k, v]) => (
                <option key={k} value={k}>{typeIcons[k]} {v}</option>
              ))}
            </select>
          </div>

          <input type="text" name="title" required placeholder={t("schoolPage.titlePlaceholder")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

          <textarea name="description" rows={2} placeholder={t("schoolPage.detailsPlaceholder")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

          <input type="date" name="logDate" defaultValue={today}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Registrando..." : t("schoolPage.register")}
          </button>
        </form>
      )}

      {/* School Logs */}
      {logs && logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map((log) => {
            const isEditing = editingId === log.id;
            const isDeleting = deleteConfirmId === log.id;
            const isHomework = log.log_type === "homework";

            return (
              <div key={log.id} className={`bg-white rounded-xl p-4 shadow-sm transition-all ${log.completed ? "opacity-60" : ""}`}>
                {/* Edit mode */}
                {isEditing ? (
                  <form action={updateSchoolLog} className="space-y-2">
                    <input type="hidden" name="logId" value={log.id} />
                    <input
                      type="text"
                      name="title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      required
                    />
                    <textarea
                      name="description"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="flex-1 py-2 bg-[#2E7268] text-white text-xs font-semibold rounded-lg">
                        Salvar
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      {/* Homework checkbox */}
                      {isHomework && (
                        <button
                          type="button"
                          onClick={() => handleToggleCompleted(log.id)}
                          disabled={isPending}
                          className="mt-1 flex-shrink-0"
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            log.completed
                              ? "bg-[#2E7268] border-[#2E7268]"
                              : "border-gray-300 hover:border-[#C07055]"
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
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{typeIcons[log.log_type] || "\u{1F4CC}"}</span>
                            <div>
                              <h4 className={`font-medium text-dark text-sm ${log.completed ? "line-through" : ""}`}>{log.title}</h4>
                              <p className="text-xs text-muted">
                                {typeLabels[log.log_type]}{log.children?.full_name ? ` - ${log.children.full_name}` : ""}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-muted flex-shrink-0">{new Date(log.log_date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                        </div>
                        {log.description && <p className="text-sm text-muted mt-1.5 ml-8">{log.description}</p>}
                        <p className="text-xs text-muted mt-1 ml-8">Por {getDisplayName(log.profiles?.full_name) || "Usuario"}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    {!isReadonly && (
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-50 ml-8">
                        <button
                          type="button"
                          onClick={() => startEdit(log)}
                          className="text-[11px] text-[#C07055] font-medium hover:underline"
                        >
                          Editar
                        </button>
                        {isDeleting ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-red-500">Excluir?</span>
                            <form action={deleteSchoolLog}>
                              <input type="hidden" name="logId" value={log.id} />
                              <button type="submit" className="text-[11px] text-red-600 font-bold hover:underline">
                                Sim
                              </button>
                            </form>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-[11px] text-gray-400 hover:underline"
                            >
                              Nao
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(log.id)}
                            className="text-[11px] text-red-400 font-medium hover:underline"
                          >
                            Excluir
                          </button>
                        )}
                        {isHomework && log.completed && (
                          <span className="ml-auto text-[10px] font-bold text-[#2E7268] px-2 py-0.5 bg-[#2E7268]/10 rounded-full">
                            Concluido
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Delete confirm */}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">{t("schoolPage.noLogs")}</p>
          <p className="text-sm text-muted mt-1">{t("schoolPage.noLogsHint")}</p>
        </div>
      )}
    </div>
  );
}
