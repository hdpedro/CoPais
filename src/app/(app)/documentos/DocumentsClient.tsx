"use client";

import { useRef, useState, useTransition } from "react";
import { useI18n } from "@/i18n/provider";
import { createDocument } from "@/actions/documents";
import DocumentList, { type DocumentRow } from "./DocumentList";

interface Child {
  id: string;
  full_name: string;
}

interface DocumentsClientProps {
  groupId: string;
  isReadonly: boolean;
  children: Child[];
  documents: DocumentRow[];
}

export default function DocumentsClient({ groupId, isReadonly, children, documents }: DocumentsClientProps) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDisabled = isPending || submitted;

  const catLabels: Record<string, string> = {
    personal: t("documentsPage.catPersonal"),
    health: t("documentsPage.catHealth"),
    education: t("documentsPage.catEducation"),
    legal: t("documentsPage.catLegal"),
    other: t("documentsPage.catOther"),
  };

  const catIcons: Record<string, string> = {
    personal: "📄",
    health: "🏥",
    education: "🎓",
    legal: "⚖️",
    other: "📁",
  };

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-2xl font-bold text-dark">{t("nav.documents")}</h1>

      {/* Upload Form */}
      {!isReadonly && (
      <form ref={formRef} action={(formData) => {
        if (isDisabled) return;
        setSubmitted(true);
        startTransition(async () => {
          await createDocument(formData);
          setSubmitted(false);
          formRef.current?.reset();
          if (fileInputRef.current) fileInputRef.current.value = "";
        });
      }} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-dark">{t("documentsPage.uploadDocument")}</h3>
        <input type="hidden" name="groupId" value={groupId} />

        <input type="text" name="name" required placeholder={t("documentsPage.documentName")}
          disabled={isDisabled}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:bg-gray-50" />

        <div className="grid grid-cols-2 gap-3">
          <select name="category" required
            disabled={isDisabled}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:bg-gray-50">
            {Object.entries(catLabels).map(([k, v]) => (
              <option key={k} value={k}>{catIcons[k]} {v}</option>
            ))}
          </select>
          <select name="childId"
            disabled={isDisabled}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:bg-gray-50">
            <option value="">{t("documentsPage.general")}</option>
            {children?.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>

        <input ref={fileInputRef} type="file" name="file" required
          disabled={isDisabled}
          className="w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 disabled:opacity-50" />

        <button type="submit"
          disabled={isDisabled}
          className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {isDisabled ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t("submitButton.saving")}
            </>
          ) : (
            t("documentsPage.upload")
          )}
        </button>
      </form>
      )}

      {/* Document List */}
      <DocumentList documents={documents} />
    </div>
  );
}
