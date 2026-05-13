"use client";

import { memo } from "react";
import { ageLabel, avatarEmoji, formatBR } from "../_lib/format";
import type { Translate, WizardChild } from "../_lib/types";

interface Props {
  kid: WizardChild;
  index: number;
  isPendingDelete: boolean;
  onEdit: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  t: Translate;
}

/**
 * Cartão de uma criança no resumo da família.
 *
 * Memoizado pra evitar re-render de TODOS os cards quando algum outro estado
 * do parent muda (typing no convite, mudança de role, etc.) — o card só
 * re-renderiza quando suas próprias props mudam.
 *
 * As props são identidades estáveis (string id, boolean, callbacks
 * memoizados via useCallback no parent), então o `memo` é eficaz.
 */
function ChildCardImpl({
  kid, index, isPendingDelete,
  onEdit, onRequestDelete, onConfirmDelete, onCancelDelete, t,
}: Props) {
  return (
    <li
      className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 animate-[slideUp_320ms_ease-out]"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "backwards" }}
    >
      {isPendingDelete ? (
        <div className="flex-1 flex items-center justify-between gap-3">
          <div className="font-semibold text-dark text-sm">
            {t("onboardingForm.removeChildConfirmInline", { name: kid.fullName })}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onCancelDelete}
              className="text-sm text-muted hover:text-dark px-3 py-1.5 rounded-md"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => onConfirmDelete(kid.id)}
              className="text-sm text-white bg-error hover:opacity-90 px-3 py-1.5 rounded-md font-semibold"
            >
              {t("onboardingForm.removeChild")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-xl flex-shrink-0" aria-hidden="true">
            {avatarEmoji(kid.sex)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-dark truncate">{kid.fullName}</div>
            <div className="text-xs text-muted">{ageLabel(kid.birthDate, t)} · {formatBR(kid.birthDate)}</div>
          </div>
          <button
            type="button"
            onClick={() => onEdit(kid.id)}
            className="p-2 text-muted hover:text-dark rounded-md"
            aria-label={t("onboardingForm.editChild")}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onRequestDelete(kid.id)}
            className="p-2 text-error/70 hover:text-error rounded-md"
            aria-label={t("onboardingForm.removeChild")}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
            </svg>
          </button>
        </>
      )}
    </li>
  );
}

export const ChildCard = memo(ChildCardImpl);
