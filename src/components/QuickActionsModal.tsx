"use client";

import { useState, useTransition } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { QUICK_ACTIONS_CATALOG, DEFAULT_QUICK_ACTIONS } from "@/lib/constants";
import { updateQuickActions } from "@/actions/profile";
import { useI18n } from "@/i18n/provider";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialPrimary: string;
  initialSecondary: string[];
}

export default function QuickActionsModal({ isOpen, onClose, initialPrimary, initialSecondary }: Props) {
  const { t } = useI18n();
  const [primary, setPrimary] = useState(initialPrimary || DEFAULT_QUICK_ACTIONS.primary);
  const [secondary, setSecondary] = useState<string[]>(
    initialSecondary.length > 0 ? initialSecondary : [...DEFAULT_QUICK_ACTIONS.secondary]
  );
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const catalogMap = Object.fromEntries(QUICK_ACTIONS_CATALOG.map((a) => [a.id, a]));

  // Secondary list excludes whatever is chosen as primary
  const selectedSecondary = secondary.filter((id) => id !== primary);
  const availableToAdd = QUICK_ACTIONS_CATALOG.filter(
    (a) => a.id !== primary && !selectedSecondary.includes(a.id)
  );

  function handlePrimaryChange(id: string) {
    setPrimary(id);
    // Remove from secondary if it was there
    setSecondary((prev) => prev.filter((s) => s !== id));
  }

  function toggleSecondary(id: string) {
    setSecondary((prev) => {
      if (prev.includes(id)) {
        return prev.filter((s) => s !== id);
      }
      if (prev.filter((s) => s !== primary).length >= 6) return prev;
      return [...prev, id];
    });
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const items = Array.from(selectedSecondary);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setSecondary(items);
  }

  function handleSave() {
    startTransition(async () => {
      await updateQuickActions(primary, selectedSecondary);
      onClose();
    });
  }

  const maxReached = selectedSecondary.length >= 6;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-[17px] font-bold text-[#2C2C2C]">
            {t("dashboard.customizeActions")}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* === PRIMARY ACTION === */}
          <div>
            <p className="text-[11px] font-bold text-[#7A8C8B] uppercase tracking-wider mb-2.5">
              {t("dashboard.primaryAction")}
            </p>
            <div className="space-y-2">
              {QUICK_ACTIONS_CATALOG.map((action) => {
                const isSelected = primary === action.id;
                return (
                  <button
                    key={action.id}
                    onClick={() => handlePrimaryChange(action.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                      isSelected
                        ? "border-[#D4735A] bg-[#D4735A]/[0.06]"
                        : "border-gray-100 bg-white hover:border-gray-200"
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: action.color + "15" }}
                    >
                      <svg
                        width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke={action.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                        dangerouslySetInnerHTML={{ __html: action.svgInner }}
                      />
                    </div>
                    <span className="flex-1 text-[13px] font-medium text-[#2C2C2C]">
                      {action.defaultLabel}
                    </span>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-[#D4735A] flex items-center justify-center flex-shrink-0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* === SECONDARY ACTIONS === */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[11px] font-bold text-[#7A8C8B] uppercase tracking-wider">
                {t("dashboard.secondaryActions")}
              </p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${maxReached ? "bg-[#D4735A]/10 text-[#D4735A]" : "bg-gray-100 text-gray-500"}`}>
                {selectedSecondary.length}/6
              </span>
            </div>

            {/* Selected (draggable) */}
            {selectedSecondary.length > 0 && (
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="secondary-actions">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="space-y-2 mb-3"
                    >
                      {selectedSecondary.map((id, index) => {
                        const action = catalogMap[id];
                        if (!action) return null;
                        return (
                          <Draggable key={id} draggableId={id} index={index}>
                            {(drag, snapshot) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                className={`flex items-center gap-3 p-3 rounded-2xl border bg-white transition-shadow ${snapshot.isDragging ? "shadow-lg border-gray-300" : "border-gray-100"}`}
                              >
                                {/* Drag handle */}
                                <div {...drag.dragHandleProps} className="text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
                                    <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
                                  </svg>
                                </div>

                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: action.color + "15" }}
                                >
                                  <svg
                                    width="18" height="18" viewBox="0 0 24 24" fill="none"
                                    stroke={action.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                                    dangerouslySetInnerHTML={{ __html: action.svgInner }}
                                  />
                                </div>
                                <span className="flex-1 text-[13px] font-medium text-[#2C2C2C]">
                                  {action.defaultLabel}
                                </span>

                                {/* Remove button */}
                                <button
                                  onClick={() => toggleSecondary(id)}
                                  className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 hover:bg-red-100 transition-colors"
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                  </svg>
                                </button>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}

            {/* Available to add */}
            {availableToAdd.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-[#9CA3AF] font-medium pt-1">
                  {maxReached ? t("dashboard.maxActionsReached") : t("dashboard.tapToAdd")}
                </p>
                {availableToAdd.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => !maxReached && toggleSecondary(action.id)}
                    disabled={maxReached}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                      maxReached
                        ? "border-gray-100 opacity-40 cursor-not-allowed"
                        : "border-gray-100 hover:border-gray-200 active:scale-[0.99]"
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: action.color + "10" }}
                    >
                      <svg
                        width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke={action.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                        dangerouslySetInnerHTML={{ __html: action.svgInner }}
                      />
                    </div>
                    <span className="flex-1 text-[13px] font-medium text-[#2C2C2C]">
                      {action.defaultLabel}
                    </span>
                    {!maxReached && (
                      <div className="w-6 h-6 rounded-full bg-[#5B9E85]/10 flex items-center justify-center flex-shrink-0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#5B9E85" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-3 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="w-full py-3.5 bg-[#D4735A] text-white font-bold text-[15px] rounded-2xl hover:bg-[#D4623E] transition-colors disabled:opacity-60 active:scale-[0.99]"
          >
            {isPending ? `${t("dashboard.saveActions")}...` : t("dashboard.saveActions")}
          </button>
        </div>
      </div>
    </div>
  );
}
