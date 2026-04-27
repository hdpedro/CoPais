"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { deleteChildDocument } from "@/actions/children";

interface ChildWithDocs {
  id: string;
  name: string;
  fullName: string;
  docsCount: number;
  docs: Array<{ id: string; name: string; category: string; file_url: string; mime_type: string | null; created_at: string }>;
  missingCategories: string[];
  completeness: number;
}

interface Doc {
  id: string;
  name: string;
  category: string;
  file_url: string;
  mime_type: string | null;
  created_at: string;
}

export default function DocumentsDashboard({
  childrenWithDocs: children,
  generalDocs,
  isReadonly,
}: {
  childrenWithDocs: ChildWithDocs[];
  generalDocs: Doc[];
  isReadonly: boolean;
}) {
  const { t } = useI18n();

  const categoryLabels: Record<string, { label: string; icon: string }> = {
    personal: { label: t("documentsPage.idRg"), icon: "🪪" },
    health: { label: t("childProfile.tabHealth"), icon: "🏥" },
    education: { label: t("childProfile.tabEducation"), icon: "🎓" },
    legal: { label: t("childProfile.docTypeBirthCert"), icon: "📜" },
    other: { label: t("childProfile.docTypeOther"), icon: "📎" },
  };

  const categoryIcon: Record<string, string> = {
    personal: "🪪",
    health: "🏥",
    education: "🎓",
    legal: "📜",
    other: "📎",
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("nav.documents")}</h1>
          <p className="text-sm text-muted mt-0.5">
            {t("documentsPage.subtitle")}
          </p>
        </div>
      </div>

      {/* Children Cards */}
      {children.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
          <p className="text-4xl mb-3">📄</p>
          <p className="text-muted text-sm">{t("children.noChildren")}</p>
          <Link href="/criancas/nova" className="inline-block mt-3 text-sm font-semibold text-primary">
            {t("children.addChild")}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {children.map((child) => (
            <div key={child.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Child Header */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-lg font-bold text-primary">
                        {child.name[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-dark">{child.name}</h3>
                      <p className="text-xs text-muted">
                        {child.docsCount} {child.docsCount === 1 ? t("documentsPage.documentSingular") : t("documentsPage.documentPlural")}
                      </p>
                    </div>
                  </div>

                  {/* Completeness badge */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${child.completeness}%`,
                            backgroundColor: child.completeness === 100 ? "#22C55E" : child.completeness >= 50 ? "#F59E0B" : "#EF4444",
                          }}
                        />
                      </div>
                      <span className={`text-xs font-semibold ${
                        child.completeness === 100 ? "text-green-600" : child.completeness >= 50 ? "text-amber-600" : "text-red-500"
                      }`}>
                        {child.completeness}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Documents Grid */}
              <div className="p-4">
                {child.docs.length > 0 ? (
                  <div className="space-y-2 mb-3">
                    {child.docs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                        <span className="text-lg">
                          {categoryIcon[doc.category] || "📎"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-dark truncate">{doc.name}</p>
                          <p className="text-[11px] text-muted">
                            {categoryLabels[doc.category]?.label || doc.category}
                            {" · "}
                            {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary text-xs font-semibold hover:underline flex-shrink-0"
                        >
                          {t("docViewer.download")}
                        </a>
                        {!isReadonly && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(t("documentsPage.confirmDeleteDoc"))) return;
                              const result = await deleteChildDocument(doc.id, child.id);
                              if (result?.error) alert(result.error);
                            }}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                            title={t("common.delete")}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted text-center py-3">
                    {t("childProfile.noDocuments")}
                  </p>
                )}

                {/* Missing categories indicator */}
                {child.missingCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {child.missingCategories.map((cat) => (
                      <span key={cat} className="text-[10px] px-2 py-0.5 bg-red-50 text-red-500 rounded-full font-medium">
                        ❌ {categoryLabels[cat]?.label || cat}
                      </span>
                    ))}
                  </div>
                )}

                {/* Add document link */}
                {!isReadonly && (
                  <Link
                    href={`/criancas/${child.id}?tab=documentos`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold text-primary bg-primary/5 rounded-xl hover:bg-primary/10 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {t("childProfile.uploadDocument")}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* General Documents (not linked to a child) */}
      {generalDocs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-dark">{t("documentsPage.general")}</h3>
            <p className="text-xs text-muted">{generalDocs.length} {generalDocs.length === 1 ? t("documentsPage.documentSingular") : t("documentsPage.documentPlural")}</p>
          </div>
          <div className="p-4 space-y-2">
            {generalDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                <span className="text-lg">{categoryIcon[doc.category] || "📎"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dark truncate">{doc.name}</p>
                  <p className="text-[11px] text-muted">
                    {categoryLabels[doc.category]?.label || doc.category}
                    {" · "}
                    {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-xs font-semibold hover:underline flex-shrink-0"
                >
                  {t("docViewer.download")}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
