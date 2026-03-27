"use client";

import { useState, useTransition } from "react";
import { toggleChecklistItem } from "@/actions/activities";
import ShareActivityButton from "@/components/ShareActivityButton";

interface ActivityChecklistModalProps {
  activity: any;
  items: any[];
  occurrenceDate: string;
  completedSet: Set<string>;
  cat: { value: string; label: string; icon: string } | undefined;
  childName: string;
  completedCount: number;
  allDone: boolean;
  label: string;
}

export default function ActivityChecklistModal({
  activity,
  items,
  occurrenceDate,
  completedSet,
  cat,
  childName,
  completedCount: initialCompleted,
  allDone: initialAllDone,
  label,
}: ActivityChecklistModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localCompleted, setLocalCompleted] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (completedSet.has(`${item.id}_${occurrenceDate}`)) {
        set.add(item.id);
      }
    }
    return set;
  });
  const [isPending, startTransition] = useTransition();

  const completedCount = localCompleted.size;
  const allDone = items.length > 0 && completedCount === items.length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  function handleToggle(itemId: string) {
    const newCompleted = new Set(localCompleted);
    const isNowCompleted = !newCompleted.has(itemId);

    if (isNowCompleted) {
      newCompleted.add(itemId);
    } else {
      newCompleted.delete(itemId);
    }
    setLocalCompleted(newCompleted);

    startTransition(async () => {
      await toggleChecklistItem(activity.id, itemId, occurrenceDate, isNowCompleted);
    });
  }

  return (
    <>
      {/* Activity Card (clickable) */}
      <button
        onClick={() => setIsOpen(true)}
        className={`w-full text-left rounded-2xl p-4 flex items-center gap-3 transition-all active:scale-[0.98] border ${
          allDone
            ? "bg-green-50 border-green-200/60"
            : "bg-white border-gray-100 hover:shadow-sm"
        }`}
      >
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
            allDone ? "bg-green-100" : ""
          }`}
          style={!allDone ? { backgroundColor: "#D4735A10" } : undefined}
        >
          {allDone ? "✅" : (cat?.icon || "📋")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-[14px] font-semibold truncate ${allDone ? "text-green-700" : "text-[#2C2C2C]"}`}>
              {activity.name}
            </p>
          </div>
          <p className="text-[11px] text-[#7A8C8B]">
            {childName}
            {activity.time_start && ` · ${activity.time_start.slice(0, 5)}`}
            {activity.location && ` · ${activity.location}`}
          </p>
          {items.length > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    allDone ? "bg-green-500" : "bg-[#D4735A]"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={`text-[10px] font-semibold ${allDone ? "text-green-600" : "text-[#7A8C8B]"}`}>
                {completedCount}/{items.length}
              </span>
            </div>
          )}
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          className="flex-shrink-0"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Modal / Bottom Sheet */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#D4735A]/10 flex items-center justify-center text-xl">
                    {cat?.icon || "📋"}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#2C2C2C]">{activity.name}</h3>
                    <p className="text-[12px] text-[#7A8C8B]">
                      {childName} · {label}
                      {activity.time_start && ` · ${activity.time_start.slice(0, 5)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <ShareActivityButton
                    activity={{
                      name: activity.name,
                      category: cat?.value || "",
                      childName,
                      timeStr: activity.time_start?.slice(0, 5) || "",
                      location: activity.location || "",
                      checklistItems: items.map((i: any) => i.name),
                      dateLabel: label,
                    }}
                  />
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-[#7A8C8B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* All done celebration */}
              {allDone && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
                  <p className="text-2xl mb-1">🎉</p>
                  <p className="text-sm font-semibold text-green-700">Tudo preparado!</p>
                  <p className="text-xs text-green-600">Mochila pronta para {activity.name.toLowerCase()}</p>
                </div>
              )}

              {/* Progress */}
              {items.length > 0 && !allDone && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-[#7A8C8B]">Preparando mochila...</span>
                    <span className="text-xs font-semibold text-[#D4735A]">{completedCount}/{items.length}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#D4735A] rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Checklist */}
              {items.length > 0 ? (
                <div className="space-y-1">
                  {items.map((item: any) => {
                    const isCompleted = localCompleted.has(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleToggle(item.id)}
                        disabled={isPending}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all active:scale-[0.98] ${
                          isCompleted
                            ? "bg-green-50"
                            : "bg-gray-50 hover:bg-gray-100"
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            isCompleted
                              ? "bg-green-500 border-green-500"
                              : "border-gray-300"
                          }`}
                        >
                          {isCompleted && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span
                          className={`text-[15px] ${
                            isCompleted
                              ? "text-green-700 line-through"
                              : "text-[#2C2C2C] font-medium"
                          }`}
                        >
                          {item.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-[13px] text-[#7A8C8B]">
                    Nenhum item no checklist.
                  </p>
                  <p className="text-[11px] text-[#9CA3AF] mt-1">
                    Edite a atividade para adicionar itens.
                  </p>
                </div>
              )}

              {/* Info */}
              {activity.location && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#7A8C8B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-[13px] text-[#7A8C8B]">{activity.location}</span>
                </div>
              )}
              {activity.notes && (
                <div className="mt-2 flex items-start gap-2">
                  <svg className="w-4 h-4 text-[#7A8C8B] mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  <span className="text-[13px] text-[#7A8C8B]">{activity.notes}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
