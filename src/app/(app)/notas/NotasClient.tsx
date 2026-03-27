"use client";

import { useI18n } from "@/i18n/provider";
import { createNote, updateNote, deleteNote } from "@/actions/notes";

interface Note {
  id: string;
  title: string;
  content: string | null;
  category: string;
  child_id: string | null;
  child_name: string | null;
  note_date: string | null;
  updated_at: string;
}

interface Child {
  id: string;
  full_name: string;
}

interface NotasClientProps {
  notes: Note[];
  children: Child[];
  groupId: string;
  filterCategory: string;
  editNote: Note | null;
  deleteConfirmNote: Note | null;
  errorMsg?: string;
  successMsg?: string;
  noteCategories: Array<{ value: string; label: string; icon: string }>;
}

export default function NotasClient({
  notes,
  children,
  groupId,
  filterCategory,
  editNote,
  deleteConfirmNote,
  errorMsg,
  successMsg,
  noteCategories,
}: NotasClientProps) {
  const { t, locale } = useI18n();

  const categoryConfig: Record<string, { color: string; bg: string; icon: string }> = {
    lembrete: { color: "text-amber-700", bg: "bg-amber-50", icon: "bell" },
    observacao: { color: "text-blue-700", bg: "bg-blue-50", icon: "eye" },
    preparacao: { color: "text-teal-700", bg: "bg-teal-50", icon: "list" },
    juridico: { color: "text-red-700", bg: "bg-red-50", icon: "shield" },
    outro: { color: "text-gray-700", bg: "bg-gray-100", icon: "file" },
  };

  const categoryLabels: Record<string, string> = {
    lembrete: t("notes.catReminder"),
    observacao: t("notes.catObservation"),
    preparacao: t("notes.catPreparation"),
    juridico: t("notes.catLegal"),
    outro: t("notes.catOther"),
  };

  const filterTabs = [
    { value: "todas", label: t("common.all") },
    ...noteCategories.map((c) => ({ value: c.value, label: categoryLabels[c.value] || c.label })),
  ];

  const dateLocale = locale === "pt" ? "pt-BR" : locale === "en" ? "en-US" : locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : "de-DE";

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <h1 className="text-2xl font-bold text-dark">{t("notes.title")}</h1>
        </div>
        <p className="text-sm text-muted mt-1">
          {t("notes.subtitle")}
        </p>
      </div>

      {/* Privacy indicator */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <p className="text-xs text-indigo-700 leading-relaxed">
          {t("notes.privacyNotice")}
        </p>
      </div>

      {/* Status messages */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {/* New note form */}
      {!editNote && (
        <form action={createNote} className="bg-white rounded-xl p-4 shadow-sm space-y-3 border border-indigo-100">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <h3 className="font-semibold text-dark">{t("notes.newNote")}</h3>
          </div>
          <input type="hidden" name="groupId" value={groupId} />

          <input
            type="text"
            name="title"
            required
            placeholder={t("notes.titlePlaceholder")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />

          <textarea
            name="content"
            rows={3}
            placeholder={t("notes.contentPlaceholder")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              name="category"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {noteCategories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon} {categoryLabels[c.value] || c.label}
                </option>
              ))}
            </select>

            <select
              name="childId"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="">{t("notes.childOptional")}</option>
              {children?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>

          <input
            type="date"
            name="noteDate"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            {t("notes.saveNote")}
          </button>
        </form>
      )}

      {/* Edit form */}
      {editNote && (
        <form action={updateNote} className="bg-white rounded-xl p-4 shadow-sm space-y-3 border-2 border-indigo-300">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <h3 className="font-semibold text-dark">{t("notes.editNote")}</h3>
          </div>
          <input type="hidden" name="noteId" value={editNote.id} />

          <input
            type="text"
            name="title"
            required
            defaultValue={editNote.title}
            placeholder={t("notes.titlePlaceholder")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />

          <textarea
            name="content"
            rows={4}
            defaultValue={editNote.content || ""}
            placeholder={t("notes.contentPlaceholder")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              name="category"
              defaultValue={editNote.category}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {noteCategories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon} {categoryLabels[c.value] || c.label}
                </option>
              ))}
            </select>

            <select
              name="childId"
              defaultValue={editNote.child_id || ""}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="">{t("notes.childOptional")}</option>
              {children?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>

          <input
            type="date"
            name="noteDate"
            defaultValue={editNote.note_date || ""}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {t("notes.saveChanges")}
            </button>
            <a
              href={filterCategory !== "todas" ? `/notas?category=${filterCategory}` : "/notas"}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t("common.cancel")}
            </a>
          </div>
        </form>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmNote && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <h3 className="font-semibold text-red-700">{t("notes.confirmDelete")}</h3>
          </div>
          <p className="text-sm text-red-600">
            {t("notes.confirmDeleteMsg", { title: deleteConfirmNote.title })}
          </p>
          <div className="flex gap-2">
            <form action={deleteNote} className="flex-1">
              <input type="hidden" name="noteId" value={deleteConfirmNote.id} />
              <button
                type="submit"
                className="w-full py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                {t("notes.yesDelete")}
              </button>
            </form>
            <a
              href={filterCategory !== "todas" ? `/notas?category=${filterCategory}` : "/notas"}
              className="flex-1 text-center py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t("common.cancel")}
            </a>
          </div>
        </div>
      )}

      {/* Category filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {filterTabs.map((tab) => (
          <a
            key={tab.value}
            href={tab.value === "todas" ? "/notas" : `/notas?category=${tab.value}`}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategory === tab.value
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Notes list */}
      {notes && notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => {
            const cat = categoryConfig[note.category] || categoryConfig.outro;
            const baseUrl = filterCategory !== "todas" ? `&category=${filterCategory}` : "";
            return (
              <div key={note.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
                        {categoryLabels[note.category] || note.category}
                      </span>
                      {note.child_name && (
                        <span className="text-[10px] text-muted bg-gray-50 px-2 py-0.5 rounded-full">
                          {note.child_name}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-dark text-sm mt-1.5">{note.title}</h3>
                    {note.content && (
                      <p className="text-xs text-muted mt-1 line-clamp-3">{note.content}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
                    {note.note_date && (
                      <span className="text-[10px] text-muted">
                        {new Date(note.note_date + "T00:00:00").toLocaleDateString(dateLocale)}
                      </span>
                    )}
                    <span className="text-[10px] text-muted">
                      {new Date(note.updated_at).toLocaleDateString(dateLocale)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-gray-100">
                  <a
                    href={`/notas?edit=${note.id}${baseUrl}`}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    {t("common.edit")}
                  </a>
                  <a
                    href={`/notas?deleteConfirm=${note.id}${baseUrl}`}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                    {t("common.delete")}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <p className="text-muted">{t("notes.noNotesYet")}</p>
          <p className="text-sm text-muted mt-1">{t("notes.createFirstNote")}</p>
        </div>
      )}
    </div>
  );
}
