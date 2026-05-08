"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { createSensitiveNote } from "@/actions/sensitive";
import { requestDeletion, approveDeletion, cancelDeletion } from "@/actions/sensitive-topics";

type ChildRef = { full_name: string } | null;
type ProfileRef = { full_name: string } | null;

interface Note {
  id: string;
  title: string;
  content: string;
  topic: string;
  is_urgent: boolean;
  source_url: string | null;
  created_at: string;
  deletion_requested_by: string | null;
  deletion_requested_at: string | null;
  // Supabase nested relation may arrive as object or single-element array.
  children: ChildRef | ChildRef[];
  profiles: ProfileRef | ProfileRef[];
}

function pickFirst<T>(v: T | T[]): T {
  return Array.isArray(v) ? v[0] : v;
}

interface SensitiveTopicsClientProps {
  groupId: string;
  isReadonly: boolean;
  childrenList: { id: string; full_name: string }[];
  notes: Note[];
  memberCount: number;
  currentUserId: string;
}

export default function SensitiveTopicsClient({
  groupId,
  isReadonly,
  childrenList,
  notes,
  memberCount,
  currentUserId,
}: SensitiveTopicsClientProps) {
  const { t } = useI18n();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const topicLabels: Record<string, string> = {
    gender_violence: t("sensitive.topicGenderViolence"),
    sexual_violence: t("sensitive.topicSexualViolence"),
    bullying: t("sensitive.topicBullying"),
    mental_health: t("sensitive.topicMentalHealth"),
    substance_abuse: t("sensitive.topicSubstanceAbuse"),
    safety: t("sensitive.topicSafety"),
    other: t("sensitive.topicOther"),
  };

  const topicIcons: Record<string, string> = {
    gender_violence: "\u{1F6E1}\uFE0F",
    sexual_violence: "\u26A0\uFE0F",
    bullying: "\u{1F6AB}",
    mental_health: "\u{1F9E0}",
    substance_abuse: "\u{1F48A}",
    safety: "\u{1F512}",
    other: "\u{1F4DD}",
  };

  const isSingleParent = memberCount <= 1;

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-dark">{t("sensitive.title")}</h1>
        <p className="text-sm text-muted mt-1">
          {t("sensitive.subtitle")}
        </p>
      </div>

      {/* Safety Notice */}
      <div className="bg-secondary/5 border border-secondary/20 rounded-xl p-4">
        <p className="text-sm text-dark font-medium">{t("sensitive.safeSpace")}</p>
        <p className="text-xs text-muted mt-1">
          {t("sensitive.safeSpaceDescription")}
        </p>
      </div>

      {/* New Note Form */}
      {!isReadonly && (
      <form action={createSensitiveNote} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-dark">{t("sensitive.shareInfo")}</h3>
        <input type="hidden" name="groupId" value={groupId} />

        <select name="topic" required
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">{t("sensitive.topicPlaceholder")}</option>
          {Object.entries(topicLabels).map(([k, v]) => (
            <option key={k} value={k}>{topicIcons[k]} {v}</option>
          ))}
        </select>

        <input type="text" name="title" required placeholder={t("sensitive.titlePlaceholder")}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <textarea name="content" required rows={4} placeholder={t("sensitive.contentPlaceholder")}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <div className="grid grid-cols-2 gap-3">
          <select name="childId"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">{t("sensitive.childOptional")}</option>
            {childrenList?.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
          <input type="url" name="sourceUrl" placeholder={t("sensitive.linkOptional")}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>

        <label className="flex items-center gap-2 text-sm text-dark">
          <input type="checkbox" name="isUrgent" className="rounded border-gray-300 text-secondary focus:ring-secondary" />
          <span className="text-secondary font-medium">{t("sensitive.markUrgent")}</span>
        </label>

        <button type="submit"
          className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          {t("sensitive.share")}
        </button>
      </form>
      )}

      {/* Notes List */}
      {notes && notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => {
            const deletionRequested = !!note.deletion_requested_by;
            const requestedByMe = note.deletion_requested_by === currentUserId;
            const requestedByOther = deletionRequested && !requestedByMe;

            return (
              <div key={note.id} className={`bg-white rounded-xl p-4 shadow-sm ${note.is_urgent ? "border-l-4 border-secondary" : ""}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{topicIcons[note.topic] || "\u{1F4DD}"}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-dark text-sm">{note.title}</h3>
                        {note.is_urgent && (
                          <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-medium">{t("sensitive.urgent")}</span>
                        )}
                        {deletionRequested && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            {t("sensitive.pendingApproval")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {topicLabels[note.topic]} {pickFirst(note.children)?.full_name ? `- ${pickFirst(note.children)!.full_name}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted">{new Date(note.created_at).toLocaleDateString("pt-BR")}</span>
                </div>
                <p className="text-sm text-muted ml-8">{note.content}</p>
                {note.source_url && (
                  <a href={note.source_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary ml-8 mt-1 inline-block hover:underline">
                    {t("sensitive.viewSource")}
                  </a>
                )}
                <p className="text-xs text-muted mt-2 ml-8">{t("sensitive.by")} {pickFirst(note.profiles)?.full_name}</p>

                {/* Deletion actions */}
                {!isReadonly && (
                  <div className="mt-3 ml-8">
                    {/* No deletion requested yet */}
                    {!deletionRequested && (
                      <>
                        {confirmingId === note.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted">{t("sensitive.deleteConfirm")}</span>
                            <form action={requestDeletion}>
                              <input type="hidden" name="noteId" value={note.id} />
                              <input type="hidden" name="groupId" value={groupId} />
                              <button
                                type="submit"
                                className="text-xs text-red-600 font-medium hover:underline"
                              >
                                {isSingleParent ? t("sensitive.confirmDelete") : t("sensitive.confirmRequest")}
                              </button>
                            </form>
                            <button
                              type="button"
                              onClick={() => setConfirmingId(null)}
                              className="text-xs text-muted hover:underline"
                            >
                              {t("common.cancel")}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingId(note.id)}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                          >
                            {isSingleParent ? t("sensitive.delete") : t("sensitive.requestDelete")}
                          </button>
                        )}
                      </>
                    )}

                    {/* I requested deletion — waiting for other parent */}
                    {requestedByMe && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-amber-600 font-medium">
                          {t("sensitive.waitingApproval")}
                        </span>
                        <form action={cancelDeletion}>
                          <input type="hidden" name="noteId" value={note.id} />
                          <input type="hidden" name="groupId" value={groupId} />
                          <button
                            type="submit"
                            className="text-xs text-muted hover:text-dark hover:underline"
                          >
                            {t("sensitive.cancelRequest")}
                          </button>
                        </form>
                      </div>
                    )}

                    {/* Other parent requested deletion — I can approve or reject */}
                    {requestedByOther && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">
                          {t("sensitive.onlyBothCanDelete")}
                        </span>
                        <form action={approveDeletion} className="inline">
                          <input type="hidden" name="noteId" value={note.id} />
                          <input type="hidden" name="groupId" value={groupId} />
                          <button
                            type="submit"
                            className="text-xs text-red-600 font-semibold hover:underline"
                          >
                            {t("sensitive.approveDelete")}
                          </button>
                        </form>
                        <form action={cancelDeletion} className="inline">
                          <input type="hidden" name="noteId" value={note.id} />
                          <input type="hidden" name="groupId" value={groupId} />
                          <button
                            type="submit"
                            className="text-xs text-muted hover:text-dark hover:underline"
                          >
                            {t("sensitive.rejectDelete")}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">{t("sensitive.noContent")}</p>
          <p className="text-sm text-muted mt-1">{t("sensitive.startSharing")}</p>
        </div>
      )}
    </div>
  );
}
