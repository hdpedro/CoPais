"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/provider";
import { createAgreement, acceptAgreement } from "@/actions/agreements";

interface Agreement {
  id: string;
  title: string;
  description: string;
  category: string;
  is_non_negotiable: boolean;
  accepted_by: string | null;
  created_by: string;
  created_at?: string;
  profiles: { full_name: string } | null;
}

interface AcordosClientProps {
  agreements: Agreement[];
  groupId: string;
  userId: string;
  isReadonly: boolean;
}

const CATEGORIES = [
  { value: "principle", icon: "⚖️", color: "#5B9E85" },
  { value: "value", icon: "💎", color: "#7C6FAE" },
  { value: "rule", icon: "📏", color: "#D4735A" },
  { value: "boundary", icon: "🚧", color: "#E8A228" },
  { value: "routine", icon: "🔁", color: "#4A90D9" },
  { value: "education", icon: "📚", color: "#6B5B95" },
  { value: "health", icon: "🏥", color: "#2E7268" },
  { value: "safety", icon: "🛡️", color: "#D4735A" },
  { value: "communication", icon: "💬", color: "#3498DB" },
  { value: "financial", icon: "💰", color: "#E8A228" },
];

export default function AcordosClient({ agreements, groupId, userId, isReadonly }: AcordosClientProps) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("principle");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categoryLabels: Record<string, string> = {
    principle: t("agreements.categoryPrinciple"),
    value: t("agreements.categoryValue"),
    rule: t("agreements.categoryRule"),
    boundary: t("agreements.categoryBoundary"),
    routine: t("agreements.categoryRoutine"),
    education: t("agreements.categoryEducation"),
    health: t("agreements.categoryHealth"),
    safety: t("agreements.categorySafety"),
    communication: t("agreements.categoryCommunication"),
    financial: t("agreements.categoryFinancial"),
  };

  const getCat = (val: string) => CATEGORIES.find((c) => c.value === val) || CATEGORIES[0];

  // Group agreements by status
  const accepted = agreements.filter((a) => a.accepted_by);
  const pending = agreements.filter((a) => !a.accepted_by);

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("agreements.title")}</h1>
          <p className="text-sm text-muted mt-1">{t("agreements.subtitle")}</p>
        </div>
        {!isReadonly && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-1.5"
          >
            {showForm ? "✕" : "+"} {showForm ? t("common.cancel") : t("agreements.newAgreement")}
          </button>
        )}
      </div>

      {/* Reminder Card — subtle */}
      <div className="bg-[#5B9E85]/5 border border-[#5B9E85]/15 rounded-xl p-3 flex items-start gap-3">
        <span className="text-lg">🤝</span>
        <div>
          <p className="text-xs font-semibold text-[#2C2C2C]">{t("agreements.importantReminder")}</p>
          <p className="text-[11px] text-muted leading-relaxed">{t("agreements.reminderText")}</p>
        </div>
      </div>

      {/* New Agreement Form — collapsible */}
      {showForm && !isReadonly && (
        <form
          action={(formData) => {
            startTransition(() => {
              createAgreement(formData);
              setShowForm(false);
            });
          }}
          className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 space-y-4 animate-[fadeIn_200ms_ease-out]"
        >
          <h3 className="font-bold text-dark text-sm">{t("agreements.newAgreement")}</h3>
          <input type="hidden" name="groupId" value={groupId} />

          {/* Category grid with icons */}
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">
              {t("agreements.categoryLabel") || "Categoria"}
            </label>
            <div className="grid grid-cols-5 gap-2">
              {CATEGORIES.slice(0, 5).map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center ${
                    selectedCategory === cat.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-[10px] font-medium text-dark leading-tight">
                    {categoryLabels[cat.value]}
                  </span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2 mt-2">
              {CATEGORIES.slice(5).map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center ${
                    selectedCategory === cat.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-[10px] font-medium text-dark leading-tight">
                    {categoryLabels[cat.value]}
                  </span>
                </button>
              ))}
            </div>
            <input type="hidden" name="category" value={selectedCategory} />
          </div>

          {/* Title */}
          <input
            type="text"
            name="title"
            required
            placeholder={t("agreements.titlePlaceholder")}
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          />

          {/* Description */}
          <textarea
            name="description"
            required
            rows={3}
            placeholder={t("agreements.descriptionPlaceholder")}
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 resize-none"
          />

          {/* Non-negotiable toggle */}
          <label className="flex items-center gap-3 bg-red-50/50 border border-red-100 rounded-xl p-3 cursor-pointer hover:bg-red-50 transition-colors">
            <input
              type="checkbox"
              name="isNonNegotiable"
              disabled={isPending}
              className="w-5 h-5 rounded border-red-300 text-red-500 focus:ring-red-400"
            />
            <div>
              <p className="text-sm font-semibold text-red-700">🔒 {t("agreements.nonNegotiable")}</p>
              <p className="text-[11px] text-red-500">{t("agreements.nonNegotiableHint") || "Este acordo não pode ser alterado sem consentimento mútuo"}</p>
            </div>
          </label>

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t("common.saving") || "Salvando..."}
              </>
            ) : (
              <>📝 {t("agreements.addAgreement")}</>
            )}
          </button>
        </form>
      )}

      {/* Pending agreements — needs attention */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            {t("agreements.pending")} ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((agreement) => {
              const cat = getCat(agreement.category);
              const isExpanded = expandedId === agreement.id;
              const isCreator = agreement.created_by === userId;
              return (
                <div key={agreement.id} className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden">
                  {/* Header */}
                  <div
                    className="p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : agreement.id)}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ backgroundColor: cat.color + "15" }}
                    >
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-dark truncate">{agreement.title}</p>
                        {agreement.is_non_negotiable && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 flex-shrink-0">
                            🔒
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted">
                        {categoryLabels[agreement.category]} · {(agreement.profiles as any)?.full_name?.split(" ")[0]}
                      </p>
                    </div>
                    {!isReadonly && !isCreator ? (
                      <form action={acceptAgreement} onClick={(e) => e.stopPropagation()}>
                        <input type="hidden" name="agreementId" value={agreement.id} />
                        <button
                          type="submit"
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#5B9E85] text-white hover:bg-[#4A8D74] transition-colors"
                        >
                          ✓ {t("agreements.accept")}
                        </button>
                      </form>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                        {t("agreements.pending")}
                      </span>
                    )}
                    <svg className={`w-4 h-4 text-muted flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {/* Expanded */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-100">
                      <p className="text-sm text-[#2C2C2C] pt-3 leading-relaxed whitespace-pre-wrap">{agreement.description}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Accepted agreements */}
      {accepted.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-[#5B9E85] uppercase tracking-wider mb-3 flex items-center gap-1.5">
            ✅ {t("agreements.accepted")} ({accepted.length})
          </h2>
          <div className="space-y-2">
            {accepted.map((agreement) => {
              const cat = getCat(agreement.category);
              const isExpanded = expandedId === agreement.id;
              return (
                <div key={agreement.id} className="bg-white rounded-xl shadow-sm border border-[#5B9E85]/15 overflow-hidden">
                  <div
                    className="p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : agreement.id)}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ backgroundColor: cat.color + "15" }}
                    >
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-dark truncate">{agreement.title}</p>
                        {agreement.is_non_negotiable && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 flex-shrink-0">
                            🔒
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted">
                        {categoryLabels[agreement.category]} · {(agreement.profiles as any)?.full_name?.split(" ")[0]}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#5B9E85]/10 text-[#5B9E85]">
                      ✅ {t("agreements.accepted")}
                    </span>
                    <svg className={`w-4 h-4 text-muted flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-100">
                      <p className="text-sm text-[#2C2C2C] pt-3 leading-relaxed whitespace-pre-wrap">{agreement.description}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {agreements.length === 0 && !showForm && (
        <div className="bg-white rounded-xl p-10 shadow-sm text-center">
          <span className="text-4xl block mb-3">📋</span>
          <p className="text-dark font-semibold">{t("agreements.noAgreements")}</p>
          <p className="text-sm text-muted mt-1">{t("agreements.startAdding")}</p>
          {!isReadonly && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 px-6 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
            >
              + {t("agreements.newAgreement")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
