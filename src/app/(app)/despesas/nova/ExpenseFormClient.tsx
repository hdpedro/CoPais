"use client";

import { useRef, useState, useTransition, useMemo } from "react";
import { getDisplayName } from "@/lib/constants";
import { useI18n } from "@/i18n/provider";

interface Props {
  groupId: string;
  children: { id: string; full_name: string }[];
  categories: { value: string; label: string; icon: string }[];
  today: string;
  createExpense: (formData: FormData) => Promise<void>;
  members: { user_id: string; full_name: string }[];
  currentUserId: string;
}

type SplitMode = "equal" | "custom" | "solo";

export default function ExpenseFormClient({ groupId, children, categories, today, createExpense, members, currentUserId }: Props) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [customPercent, setCustomPercent] = useState(50);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);

  const otherMember = members.find((m) => m.user_id !== currentUserId);
  const [selectedChildren, setSelectedChildren] = useState<Set<string>>(new Set());

  const toggleChild = (childId: string) => {
    setSelectedChildren(prev => {
      const next = new Set(prev);
      if (next.has(childId)) next.delete(childId);
      else next.add(childId);
      return next;
    });
  };

  const toggleAllChildren = () => {
    if (selectedChildren.size === children.length) {
      setSelectedChildren(new Set());
    } else {
      setSelectedChildren(new Set(children.map(c => c.id)));
    }
  };

  const allSelected = children.length > 0 && selectedChildren.size === children.length;

  const splitRatioJson = useMemo(() => {
    if (members.length < 2 || !otherMember) return null;
    if (splitMode === "equal") {
      return JSON.stringify({ [currentUserId]: 50, [otherMember.user_id]: 50 });
    }
    if (splitMode === "solo") {
      return JSON.stringify({ [currentUserId]: 100, [otherMember.user_id]: 0 });
    }
    // custom
    return JSON.stringify({ [currentUserId]: customPercent, [otherMember.user_id]: 100 - customPercent });
  }, [splitMode, customPercent, members, currentUserId, otherMember]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptPreview(null);
      setReceiptFileName(null);
      return;
    }
    setReceiptFileName(file.name);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setReceiptPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      // PDF - show icon instead of preview
      setReceiptPreview(null);
    }
  };

  const removeReceipt = () => {
    setReceiptPreview(null);
    setReceiptFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (formData: FormData) => {
    if (submitted || isPending) return;
    setSubmitted(true);
    startTransition(async () => {
      await createExpense(formData);
    });
  };

  const isDisabled = isPending || submitted;

  return (
    <form ref={formRef} action={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
      <input type="hidden" name="groupId" value={groupId} />
      {splitRatioJson && <input type="hidden" name="splitRatio" value={splitRatioJson} />}

      <div>
        <label className="block text-sm font-medium text-dark mb-1">{t("expenseForm.description")}</label>
        <input type="text" name="description" required placeholder={t("expenseForm.descriptionPlaceholder")}
          disabled={isDisabled}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50" />
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">{t("expenseForm.amount")}</label>
        <input type="number" name="amount" required step="0.01" min="0.01" placeholder="0.00"
          disabled={isDisabled}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50" />
      </div>

      {/* Receipt upload */}
      <div>
        <label className="block text-sm font-medium text-dark mb-1">{t("expenseForm.receiptOptional")}</label>
        {!receiptFileName ? (
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-lg text-muted hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium">{t("expenseForm.photoOrPdf")}</span>
          </button>
        ) : (
          <div className="relative border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-3">
              {receiptPreview ? (
                <img
                  src={receiptPreview}
                  alt={t("expenseForm.receiptPreview")}
                  className="w-16 h-16 object-cover rounded-lg"
                />
              ) : (
                <div className="w-16 h-16 bg-error/10 rounded-lg flex items-center justify-center">
                  <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dark truncate">{receiptFileName}</p>
                <p className="text-xs text-muted">{t("expenseForm.receiptAttached")}</p>
              </div>
              <button
                type="button"
                disabled={isDisabled}
                onClick={removeReceipt}
                className="p-1.5 text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          name="receipt"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">{t("checkinForm.category")}</label>
        <select name="category" required disabled={isDisabled}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50">
          {categories.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
          ))}
        </select>
      </div>

      {/* Child selector — multi-select chips */}
      <div>
        <label className="block text-sm font-medium text-dark mb-2">{t("expenseForm.childOptional")}</label>
        <div className="flex flex-wrap gap-2">
          {/* "Geral" chip — selected when no children are selected */}
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => setSelectedChildren(new Set())}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all border-2 ${
              selectedChildren.size === 0
                ? "border-primary bg-primary/10 text-primary"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            } disabled:opacity-50`}
          >
            <span className="text-xs">📋</span>
            {t("expenseForm.general")}
          </button>

          {/* Individual child chips with checkmarks */}
          {children.map((child) => {
            const isSelected = selectedChildren.has(child.id);
            return (
              <button
                key={child.id}
                type="button"
                disabled={isDisabled}
                onClick={() => toggleChild(child.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all border-2 ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                } disabled:opacity-50`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isSelected ? "bg-primary text-white" : "bg-gray-200 text-gray-500"
                }`}>
                  {isSelected ? "✓" : child.full_name.charAt(0).toUpperCase()}
                </span>
                {child.full_name.split(" ")[0]}
              </button>
            );
          })}

          {/* "Todos" chip — only show if 2+ children */}
          {children.length >= 2 && (
            <button
              type="button"
              disabled={isDisabled}
              onClick={toggleAllChildren}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all border-2 ${
                allSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              } disabled:opacity-50`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                allSelected ? "bg-primary text-white" : "bg-gray-200 text-gray-500"
              }`}>
                {allSelected ? "✓" : "∀"}
              </span>
              Todos
            </button>
          )}
        </div>

        {/* Hidden inputs for selected children */}
        {selectedChildren.size === 0 && (
          <input type="hidden" name="childId" value="" />
        )}
        {selectedChildren.size === 1 && (
          <input type="hidden" name="childId" value={[...selectedChildren][0]} />
        )}
        {selectedChildren.size > 1 && [...selectedChildren].map(id => (
          <input key={id} type="hidden" name="childIds" value={id} />
        ))}
      </div>

      {/* Split ratio selector */}
      {members.length >= 2 && otherMember && (
        <div>
          <label className="block text-sm font-medium text-dark mb-2">{t("expenseForm.splitLabel")}</label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setSplitMode("equal")}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                splitMode === "equal"
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-gray-200 text-muted hover:bg-gray-50"
              } disabled:opacity-50`}
            >
              50/50
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setSplitMode("custom")}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                splitMode === "custom"
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-gray-200 text-muted hover:bg-gray-50"
              } disabled:opacity-50`}
            >
              {t("expenseForm.custom")}
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setSplitMode("solo")}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                splitMode === "solo"
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-gray-200 text-muted hover:bg-gray-50"
              } disabled:opacity-50`}
            >
              {t("expenseForm.allMine")}
            </button>
          </div>

          {splitMode === "custom" && (
            <div className="mt-3 space-y-2">
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={customPercent}
                onChange={(e) => setCustomPercent(Number(e.target.value))}
                disabled={isDisabled}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs">
                <span className="text-primary font-medium">
                  {t("expenseForm.you")}: {customPercent}%
                </span>
                <span className="text-muted font-medium">
                  {getDisplayName(otherMember.full_name, true)}: {100 - customPercent}%
                </span>
              </div>
            </div>
          )}

          {splitMode === "solo" && (
            <p className="mt-2 text-xs text-muted">
              {t("expenseForm.soloDescription", { name: getDisplayName(otherMember.full_name, true) })}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-dark mb-1">{t("expenseForm.date")}</label>
        <input type="date" name="expenseDate" required defaultValue={today} max={today}
          disabled={isDisabled}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50" />
      </div>

      <button
        type="submit"
        disabled={isDisabled}
        className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isDisabled ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t("expenseForm.registering")}
          </>
        ) : (
          t("expenseForm.registerExpense")
        )}
      </button>

      {submitted && isPending && (
        <p className="text-center text-sm text-muted">{t("expenseForm.savingExpense")}</p>
      )}
    </form>
  );
}
