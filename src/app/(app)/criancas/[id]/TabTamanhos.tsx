"use client";

/**
 * TabTamanhos — UI do módulo Tamanhos (Foundation Collab #7).
 *
 * Dor real do coparenting: "qual o número de sapato/calça da Maria?".
 * Antes resolvido em foto de etiqueta no WhatsApp + memória do parent.
 *
 * Princípio UX: glanceability primeiro (80% dos usos é OLHAR, não
 * registrar). Cada linha mostra valor atual + freshness badge; tap
 * abre modal de edit. Empty rows ("—") são tappable pra primeiro registro.
 *
 * Check-in passivo: quando o tamanho mais antigo está > N dias, banner
 * sutil sugere "ainda usa este?" — clique "Sim" insere `is_confirmation=true`
 * (renova freshness sem poluir histórico como mudança).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordChildSize,
  updateChildSize,
  deleteChildSize,
} from "@/actions/child-sizes";
import type {
  CurrentSize,
  ChildSizeRecord,
  SizeKind,
} from "@/lib/services/child-sizes";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface Props {
  childId: string;
  groupId: string;
  isReadonly: boolean;
  currentSizes: CurrentSize[];
  sizeHistory: ChildSizeRecord[];
  t: TFn;
}

/**
 * Kinds visíveis no card "atuais", em ordem de prioridade UX (sapato muda
 * mais, calça depois, etc.). 'other' é exibido após esses, agrupado por
 * custom_label.
 */
const PRIMARY_KINDS: readonly SizeKind[] = ["shoe", "pants", "shirt", "coat"];

/** Limite em dias pra trigger do check-in passivo por kind. */
const STALE_DAYS: Record<SizeKind, number> = {
  shoe: 150, // sapato muda a cada ~5 meses
  pants: 240, // calça ~8 meses
  shirt: 240, // camiseta ~8 meses
  coat: 365, // casaco anual (sazonal)
  other: 240,
};

function kindLabel(t: TFn, kind: SizeKind, customLabel: string | null): string {
  if (kind === "other") return customLabel || t("childSizes.kind.other");
  return t(`childSizes.kind.${kind}`);
}

function kindIcon(kind: SizeKind): string {
  switch (kind) {
    case "shoe": return "\u{1F45F}"; // 👟
    case "pants": return "\u{1F456}"; // 👖
    case "shirt": return "\u{1F455}"; // 👕
    case "coat": return "\u{1F9E5}"; // 🧥
    case "other": return "\u{1F457}"; // 👗
  }
}

function freshnessClass(daysSince: number, kind: SizeKind): string {
  const stale = STALE_DAYS[kind];
  if (daysSince <= 30) return "text-emerald-600 bg-emerald-50";
  if (daysSince <= stale) return "text-gray-600 bg-gray-100";
  return "text-amber-700 bg-amber-50";
}

function freshnessLabel(daysSince: number, t: TFn): string {
  if (daysSince === 0) return t("childSizes.recordedToday");
  if (daysSince === 1) return t("childSizes.recordedYesterday");
  if (daysSince < 30) return t("childSizes.recordedDaysAgo", { count: daysSince });
  if (daysSince < 60) return t("childSizes.recordedMonthAgo");
  const months = Math.floor(daysSince / 30);
  if (months < 12) return t("childSizes.recordedMonthsAgo", { count: months });
  const years = Math.floor(daysSince / 365);
  return years === 1
    ? t("childSizes.recordedYearAgo")
    : t("childSizes.recordedYearsAgo", { count: years });
}

interface EditModalState {
  mode: "create" | "edit";
  kind: SizeKind;
  customLabel: string | null;
  sizeId?: string;
  sizeValue?: string;
  recordedOn?: string;
  notes?: string;
}

export default function TabTamanhos({
  childId,
  groupId,
  isReadonly,
  currentSizes,
  sizeHistory,
  t,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<EditModalState | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Indexar atuais por key (kind ou kind+custom_label)
  const currentByKey = new Map<string, CurrentSize>();
  for (const s of currentSizes) {
    const key = s.kind === "other" ? `other:${s.custom_label || ""}` : s.kind;
    currentByKey.set(key, s);
  }

  // Linhas: PRIMARY_KINDS sempre exibidos (placeholder "—" se vazio); depois
  // entradas 'other' distintas (uma por custom_label).
  const otherRows = currentSizes.filter((s) => s.kind === "other");

  // Check-in passivo: kind mais antigo que ultrapassou stale threshold.
  const staleCheckin = (() => {
    for (const s of currentSizes) {
      if (s.days_since_recorded > STALE_DAYS[s.kind]) {
        return s;
      }
    }
    return null;
  })();

  function openCreateModal(kind: SizeKind, customLabel: string | null = null) {
    setModal({ mode: "create", kind, customLabel });
  }
  function openEditModal(s: CurrentSize | ChildSizeRecord) {
    setModal({
      mode: "edit",
      kind: s.kind,
      customLabel: s.custom_label,
      sizeId: "size_id" in s ? s.size_id : s.id,
      sizeValue: s.size_value,
      recordedOn:
        "recorded_on" in s ? s.recorded_on : new Date().toISOString().slice(0, 10),
      notes: "notes" in s ? s.notes ?? "" : "",
    });
  }
  function closeModal() {
    setModal(null);
  }

  function handleConfirmStaleSize(s: CurrentSize) {
    const fd = new FormData();
    fd.append("childId", childId);
    fd.append("groupId", groupId);
    fd.append("kind", s.kind);
    if (s.kind === "other" && s.custom_label) fd.append("customLabel", s.custom_label);
    fd.append("sizeValue", s.size_value);
    fd.append("isConfirmation", "1");
    startTransition(async () => {
      await recordChildSize(fd);
      router.refresh();
    });
  }

  function handleSubmitModal(form: HTMLFormElement) {
    if (!modal) return;
    const fd = new FormData(form);
    fd.set("childId", childId);
    fd.set("groupId", groupId);
    fd.set("kind", modal.kind);
    if (modal.kind === "other") {
      const cl = (fd.get("customLabel") as string) || modal.customLabel || "";
      fd.set("customLabel", cl);
    }
    startTransition(async () => {
      if (modal.mode === "create") {
        await recordChildSize(fd);
      } else if (modal.sizeId) {
        fd.set("sizeId", modal.sizeId);
        await updateChildSize(fd);
      }
      setModal(null);
      router.refresh();
    });
  }

  function handleDelete(sizeId: string) {
    if (!confirm(t("childSizes.confirmDelete"))) return;
    const fd = new FormData();
    fd.set("sizeId", sizeId);
    fd.set("childId", childId);
    startTransition(async () => {
      await deleteChildSize(fd);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Check-in passivo */}
      {staleCheckin && !isReadonly && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
          <span className="text-amber-700 text-lg">⏰</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-900 font-medium">
              {t("childSizes.staleCheckinTitle", {
                kind: kindLabel(t, staleCheckin.kind, staleCheckin.custom_label),
                size: staleCheckin.size_value,
              })}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {freshnessLabel(staleCheckin.days_since_recorded, t)}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleConfirmStaleSize(staleCheckin)}
                className="px-3 py-1 text-xs font-semibold bg-amber-700 text-white rounded-lg disabled:opacity-50"
              >
                {t("childSizes.confirmStill")}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => openEditModal(staleCheckin)}
                className="px-3 py-1 text-xs font-semibold bg-white border border-amber-300 text-amber-900 rounded-lg disabled:opacity-50"
              >
                {t("childSizes.updateNow")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card: Tamanhos atuais */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-dark">
              {t("childSizes.currentTitle")}
            </h3>
            <p className="text-xs text-muted mt-0.5">
              {t("childSizes.currentSubtitle")}
            </p>
          </div>
        </div>
        <ul className="divide-y divide-gray-100">
          {PRIMARY_KINDS.map((kind) => {
            const current = currentByKey.get(kind);
            return (
              <li key={kind} id={`size-row-${kind}`}>
                <button
                  type="button"
                  disabled={isReadonly}
                  onClick={() =>
                    current
                      ? openEditModal(current)
                      : openCreateModal(kind)
                  }
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 disabled:cursor-not-allowed text-left"
                >
                  <span className="text-2xl">{kindIcon(kind)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark">
                      {t(`childSizes.kind.${kind}`)}
                    </p>
                    {current ? (
                      <p className="text-xs text-muted truncate mt-0.5">
                        {current.creator_first_name
                          ? t("childSizes.byParent", {
                              parent: current.creator_first_name,
                            })
                          : null}
                      </p>
                    ) : (
                      <p className="text-xs text-muted mt-0.5">
                        {t("childSizes.tapToRegister")}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="text-lg font-bold text-dark">
                      {current ? current.size_value : "—"}
                    </span>
                    {current && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${freshnessClass(
                          current.days_since_recorded,
                          kind,
                        )}`}
                      >
                        {freshnessLabel(current.days_since_recorded, t)}
                      </span>
                    )}
                  </div>
                  <svg
                    className="w-4 h-4 text-muted shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </li>
            );
          })}
          {/* Outros (custom_label distintos) */}
          {otherRows.map((s) => (
            <li
              key={`other-${s.custom_label}-${s.size_id}`}
              id={`size-row-other-${s.size_id}`}
            >
              <button
                type="button"
                disabled={isReadonly}
                onClick={() => openEditModal(s)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 disabled:cursor-not-allowed text-left"
              >
                <span className="text-2xl">{kindIcon("other")}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dark capitalize">
                    {s.custom_label}
                  </p>
                  {s.creator_first_name && (
                    <p className="text-xs text-muted truncate mt-0.5">
                      {t("childSizes.byParent", { parent: s.creator_first_name })}
                    </p>
                  )}
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <span className="text-lg font-bold text-dark">{s.size_value}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${freshnessClass(
                      s.days_since_recorded,
                      "other",
                    )}`}
                  >
                    {freshnessLabel(s.days_since_recorded, t)}
                  </span>
                </div>
                <svg
                  className="w-4 h-4 text-muted shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          {!isReadonly && (
            <button
              type="button"
              onClick={() => openCreateModal("other")}
              className="text-xs font-semibold text-primary hover:underline"
            >
              + {t("childSizes.addOther")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="text-xs font-medium text-muted hover:text-dark ml-auto"
          >
            {showHistory ? t("childSizes.hideHistory") : t("childSizes.showHistory")}
          </button>
        </div>
      </div>

      {/* Histórico */}
      {showHistory && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-dark">
              {t("childSizes.historyTitle")}
            </h3>
            <p className="text-xs text-muted mt-0.5">
              {t("childSizes.historySubtitle", { count: sizeHistory.length })}
            </p>
          </div>
          {sizeHistory.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted text-center">
              {t("childSizes.historyEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {sizeHistory.map((row) => (
                <li
                  key={row.id}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  <span className="text-xl">{kindIcon(row.kind)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark capitalize">
                      {kindLabel(t, row.kind, row.custom_label)}{" "}
                      <span className="text-muted font-normal">
                        {row.is_confirmation
                          ? `· ${t("childSizes.confirmedSuffix")}`
                          : ""}
                      </span>
                    </p>
                    <p className="text-xs text-muted truncate">
                      {row.recorded_on.split("-").reverse().join("/")}
                      {row.creator_first_name
                        ? ` · ${row.creator_first_name}`
                        : ""}
                      {row.notes ? ` · ${row.notes}` : ""}
                    </p>
                  </div>
                  <span className="text-base font-bold text-dark">
                    {row.size_value}
                  </span>
                  {!isReadonly && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(row)}
                        title={t("childSizes.edit")}
                        className="p-1 text-muted hover:text-dark"
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        title={t("childSizes.delete")}
                        className="p-1 text-muted hover:text-red-600"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Modal de Create / Edit */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-lg p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("childSizes.modalTitle")}
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl">{kindIcon(modal.kind)}</span>
              <h3 className="text-lg font-bold text-dark flex-1">
                {modal.mode === "create"
                  ? t("childSizes.modalCreateTitle", {
                      kind: kindLabel(t, modal.kind, modal.customLabel),
                    })
                  : t("childSizes.modalEditTitle", {
                      kind: kindLabel(t, modal.kind, modal.customLabel),
                    })}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-muted hover:text-dark"
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmitModal(e.currentTarget);
              }}
              className="space-y-3"
            >
              {modal.kind === "other" && (
                <label className="block">
                  <span className="text-xs font-medium text-muted">
                    {t("childSizes.fieldCustomLabel")}
                  </span>
                  <input
                    type="text"
                    name="customLabel"
                    defaultValue={modal.customLabel || ""}
                    placeholder={t("childSizes.fieldCustomLabelPlaceholder")}
                    maxLength={40}
                    required
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-medium text-muted">
                  {t("childSizes.fieldSizeValue")}
                </span>
                <input
                  type="text"
                  name="sizeValue"
                  defaultValue={modal.sizeValue || ""}
                  placeholder={
                    modal.kind === "shoe"
                      ? t("childSizes.shoePlaceholder")
                      : t("childSizes.clothesPlaceholder")
                  }
                  maxLength={24}
                  required
                  inputMode={modal.kind === "shoe" ? "decimal" : "text"}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">
                  {t("childSizes.fieldDate")}
                </span>
                <input
                  type="date"
                  name="recordedOn"
                  defaultValue={
                    modal.recordedOn || new Date().toISOString().slice(0, 10)
                  }
                  max={new Date().toISOString().slice(0, 10)}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">
                  {t("childSizes.fieldNotes")}
                </span>
                <input
                  type="text"
                  name="notes"
                  defaultValue={modal.notes || ""}
                  placeholder={t("childSizes.fieldNotesPlaceholder")}
                  maxLength={500}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </label>
              <div className="flex gap-2 pt-2">
                {modal.mode === "edit" && modal.sizeId && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = modal.sizeId!;
                      closeModal();
                      handleDelete(id);
                    }}
                    className="px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    {t("childSizes.delete")}
                  </button>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-3 py-2 text-sm font-semibold text-muted hover:text-dark"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-dark disabled:opacity-50"
                >
                  {isPending ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
