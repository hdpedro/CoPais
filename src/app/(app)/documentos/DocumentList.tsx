"use client";

import { useState } from "react";
import DocumentViewer from "./DocumentViewer";
import { useI18n } from "@/i18n/provider";

type ChildRef = { full_name: string } | null;
type ProfileRef = { full_name: string } | null;

export interface DocumentRow {
  id: string;
  name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  category: string;
  created_at: string;
  // Supabase nested selects can return either a single object or an array
  // depending on the join cardinality inferred at query time. Both shapes
  // are accepted; readers normalize via `Array.isArray`.
  children: ChildRef | ChildRef[];
  profiles: ProfileRef | ProfileRef[];
}

function pickFirst<T>(v: T | T[]): T {
  return Array.isArray(v) ? v[0] : v;
}

const catIcons: Record<string, string> = {
  personal: "\u{1F4C4}",
  health: "\u{1F3E5}",
  education: "\u{1F393}",
  legal: "\u{2696}\u{FE0F}",
  other: "\u{1F4C1}",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function DocumentList({
  documents,
}: {
  documents: DocumentRow[];
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<DocumentRow | null>(null);

  const catLabels: Record<string, string> = {
    personal: t("docViewer.catPersonal"),
    health: t("docViewer.catHealth"),
    education: t("docViewer.catEducation"),
    legal: t("docViewer.catLegal"),
    other: t("docViewer.catOther"),
  };

  if (!documents || documents.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 shadow-sm text-center">
        <p className="text-muted">{t("docList.noDocuments")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {documents.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => setSelected(doc)}
            className="w-full text-left block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {catIcons[doc.category] || catIcons.other}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-dark text-sm truncate">
                  {doc.name}
                </p>
                <p className="text-xs text-muted">
                  {catLabels[doc.category]}{" "}
                  {pickFirst(doc.children)?.full_name
                    ? `- ${pickFirst(doc.children)!.full_name}`
                    : ""}
                </p>
                <p className="text-xs text-muted">
                  {pickFirst(doc.profiles)?.full_name} -{" "}
                  {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                  {doc.file_size ? ` - ${formatSize(doc.file_size)}` : ""}
                </p>
              </div>
              <svg
                className="w-5 h-5 text-primary flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <DocumentViewer
          doc={{
            id: selected.id,
            name: selected.name,
            file_url: selected.file_url,
            file_size: selected.file_size,
            mime_type: selected.mime_type,
            category: selected.category,
            created_at: selected.created_at,
            child_name: pickFirst(selected.children)?.full_name || undefined,
            uploader_name: pickFirst(selected.profiles)?.full_name || undefined,
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
