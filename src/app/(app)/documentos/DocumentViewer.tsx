"use client";

import { useEffect, useCallback } from "react";
import { useI18n } from "@/i18n/provider";

interface Document {
  id: string;
  name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  category: string;
  child_name?: string;
  uploader_name?: string;
  created_at: string;
}

const catColors: Record<string, string> = {
  personal: "bg-blue-100 text-blue-700",
  health: "bg-red-100 text-red-700",
  education: "bg-purple-100 text-purple-700",
  legal: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-700",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function isImage(mime: string | null) {
  if (!mime) return false;
  return mime.startsWith("image/");
}

function isPdf(mime: string | null) {
  return mime === "application/pdf";
}

export default function DocumentViewer({
  doc,
  onClose,
}: {
  doc: Document;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const catLabels: Record<string, string> = {
    personal: t("docViewer.catPersonal"),
    health: t("docViewer.catHealth"),
    education: t("docViewer.catEducation"),
    legal: t("docViewer.catLegal"),
    other: t("docViewer.catOther"),
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);
  const mime = doc.mime_type;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="font-semibold text-[#2C2C2C] text-sm sm:text-base truncate">
              {doc.name}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  catColors[doc.category] || catColors.other
                }`}
              >
                {catLabels[doc.category] || doc.category}
              </span>
              {doc.file_size && (
                <span className="text-xs text-gray-400">
                  {formatSize(doc.file_size)}
                </span>
              )}
              {doc.child_name && (
                <span className="text-xs text-gray-400">
                  {doc.child_name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={doc.file_url}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors"
              style={{ backgroundColor: "#D4735A" }}
              onClick={(e) => e.stopPropagation()}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              {t("docViewer.download")}
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
              aria-label={t("common.close")}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-50">
          {isImage(mime) ? (
            <img
              src={doc.file_url}
              alt={doc.name}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          ) : isPdf(mime) ? (
            <iframe
              src={doc.file_url}
              title={doc.name}
              className="w-full h-[70vh] rounded-lg border-0"
            />
          ) : (
            <div className="text-center py-12 px-6">
              <div className="text-5xl mb-4">
                {mime?.includes("word") || mime?.includes("document")
                  ? "\u{1F4DD}"
                  : mime?.includes("spreadsheet") || mime?.includes("excel")
                  ? "\u{1F4CA}"
                  : "\u{1F4C4}"}
              </div>
              <p className="text-[#2C2C2C] font-semibold mb-1">{doc.name}</p>
              <p className="text-sm text-gray-400 mb-1">
                {mime || t("docViewer.unknownType")}
              </p>
              {doc.file_size && (
                <p className="text-sm text-gray-400 mb-4">
                  {formatSize(doc.file_size)}
                </p>
              )}
              <p className="text-sm text-gray-500 mb-6">
                {t("docViewer.previewNotAvailable")}
              </p>
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold transition-colors"
                style={{ backgroundColor: "#D4735A" }}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                {t("docViewer.downloadFile")}
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-400">
            {doc.uploader_name && <span>{t("docViewer.uploadedBy")} {doc.uploader_name}</span>}
            {doc.uploader_name && " - "}
            {new Date(doc.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>
    </div>
  );
}
