"use client";

import { useState, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { createSwapRequest } from "@/actions/calendar";
import { deleteActivity, deleteEvent, deleteAppointment, cancelActivityOccurrence, changeActivityResponsible, changeActivityResponsibleAll, toggleChecklistItem, editActivityAll, editActivityOccurrence } from "@/actions/activities";
import { getBrazilToday, type CustodyDayInfo } from "@/lib/calendar-utils";
import { ACTIVITY_CATEGORIES } from "@/lib/constants";
import { useI18n } from "@/i18n/provider";
import ActivityReportModal from "@/app/(app)/atividades/ActivityReportModal";
import ShareActivityButton from "@/components/ShareActivityButton";

interface ChecklistItemInfo {
  id: string;
  name: string;
  completed: boolean;
}

interface ActivityReportInfo {
  status: string; // 'completed' | 'missed' | 'cancelled'
  notes: string | null;
  child_mood: string | null;
  responsible_override?: string | null;
  responsible_override_id?: string | null;
}

interface ActivityInfo {
  id: string;
  name: string;
  category: string;
  time_start: string | null;
  time_end?: string | null;
  location: string | null;
  childName: string;
  checklistCount: number;
  description?: string | null;
  all_day?: boolean;
  assigned_to_name?: string | null;
  report?: ActivityReportInfo | null;
  recurrence_type?: string;
  teacher_name?: string | null;
  class_name?: string | null;
  room?: string | null;
  responsible_id?: string | null;
  responsible_name?: string | null;
  checklistItems?: ChecklistItemInfo[];
  source?: "activity" | "event" | "appointment";
}

interface DayDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dateKey: string;
  dayInfo: CustodyDayInfo | null;
  groupId: string;
  currentUserId: string;
  isParent: boolean;
  pendingSwapForDay?: boolean;
  activities?: ActivityInfo[];
  memberNames?: Record<string, string>;
}

export default memo(function DayDetailSheet({
  isOpen,
  onClose,
  dateKey,
  dayInfo,
  groupId,
  currentUserId,
  isParent,
  pendingSwapForDay = false,
  activities = [],
  memberNames = {},
}: DayDetailSheetProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [showSwapForm, setShowSwapForm] = useState(false);
  const [swapType, setSwapType] = useState<"swap" | "visit">("swap");
  const [proposedDate, setProposedDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [reportActivity, setReportActivity] = useState<ActivityInfo | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [changingResponsible, setChangingResponsible] = useState<string | null>(null);
  const [responsibleSaving, setResponsibleSaving] = useState(false);
  const [responsibleSuccess, setResponsibleSuccess] = useState<string | null>(null);
  const [checklistExpanded, setChecklistExpanded] = useState<string | null>(null);
  const [optimisticChecklist, setOptimisticChecklist] = useState<Record<string, Record<string, boolean>>>({});
  const [responsibleMode, setResponsibleMode] = useState<"pick" | "confirm">("pick");
  const [selectedNewResponsible, setSelectedNewResponsible] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScope, setEditScope] = useState<"this" | "all" | null>(null);
  const [editScopePickerId, setEditScopePickerId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<{
    name: string;
    timeStart: string;
    timeEnd: string;
    location: string;
    teacherName: string;
    className: string;
    room: string;
    notes: string;
    responsibleId: string;
  }>({ name: "", timeStart: "", timeEnd: "", location: "", teacherName: "", className: "", room: "", notes: "", responsibleId: "" });

  const isRecurring = (act: ActivityInfo) =>
    act.recurrence_type && act.recurrence_type !== "never";

  const handleDeleteAll = useCallback(async (activityId: string, source?: "activity" | "event" | "appointment") => {
    setDeleting(true);
    try {
      if (source === "event") {
        await deleteEvent(activityId);
      } else if (source === "appointment") {
        await deleteAppointment(activityId);
      } else {
        await deleteActivity(activityId);
      }
      setDeleteConfirmId(null);
      router.refresh();
    } catch {
      // redirect throws in server actions
    } finally {
      setDeleting(false);
    }
  }, [router]);

  const handleDeleteThisDay = useCallback(async (activityId: string) => {
    setDeleting(true);
    try {
      await cancelActivityOccurrence(activityId, dateKey);
      setDeleteConfirmId(null);
      router.refresh();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }, [dateKey, router]);

  const handleChangeResponsible = useCallback(async (activityId: string, newResponsibleId: string) => {
    setResponsibleSaving(true);
    setResponsibleSuccess(null);
    try {
      const result = await changeActivityResponsible(activityId, dateKey, newResponsibleId);
      if (result?.error) {
        setError(result.error);
      } else {
        setChangingResponsible(null);
        setResponsibleMode("pick");
        setSelectedNewResponsible(null);
        const newName = Object.entries(memberNames).find(([id]) => id === newResponsibleId)?.[1] || "";
        setResponsibleSuccess(newName);
        setTimeout(() => setResponsibleSuccess(null), 4000);
        router.refresh();
      }
    } catch {
      // ignore
    } finally {
      setResponsibleSaving(false);
    }
  }, [dateKey, router, memberNames]);

  const handleChangeResponsibleAll = useCallback(async (activityId: string, newResponsibleId: string) => {
    setResponsibleSaving(true);
    setResponsibleSuccess(null);
    try {
      const result = await changeActivityResponsibleAll(activityId, newResponsibleId);
      if (result?.error) {
        setError(result.error);
      } else {
        setChangingResponsible(null);
        setResponsibleMode("pick");
        setSelectedNewResponsible(null);
        const newName = Object.entries(memberNames).find(([id]) => id === newResponsibleId)?.[1] || "";
        setResponsibleSuccess(newName);
        setTimeout(() => setResponsibleSuccess(null), 4000);
        router.refresh();
      }
    } catch {
      // ignore
    } finally {
      setResponsibleSaving(false);
    }
  }, [router, memberNames]);

  async function handleToggleChecklist(activityId: string, itemId: string, completed: boolean) {
    // Optimistic update
    setOptimisticChecklist((prev) => ({
      ...prev,
      [activityId]: {
        ...(prev[activityId] || {}),
        [itemId]: completed,
      },
    }));
    try {
      const result = await toggleChecklistItem(activityId, itemId, dateKey, completed);
      if (result?.error) {
        // Revert optimistic update
        setOptimisticChecklist((prev) => {
          const copy = { ...prev };
          if (copy[activityId]) {
            delete copy[activityId][itemId];
          }
          return copy;
        });
      }
    } catch {
      // Revert on error
      setOptimisticChecklist((prev) => {
        const copy = { ...prev };
        if (copy[activityId]) {
          delete copy[activityId][itemId];
        }
        return copy;
      });
    }
  }

  function startEdit(act: ActivityInfo, scope: "this" | "all") {
    setEditingId(act.id);
    setEditScope(scope);
    setEditScopePickerId(null);
    setEditForm({
      name: act.name || "",
      timeStart: act.time_start?.slice(0, 5) || "",
      timeEnd: act.time_end?.slice(0, 5) || "",
      location: act.location || "",
      teacherName: act.teacher_name || "",
      className: act.class_name || "",
      room: act.room || "",
      notes: act.description || "",
      responsibleId: act.responsible_id || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditScope(null);
    setEditScopePickerId(null);
  }

  async function handleEditSave(activityId: string) {
    setEditSaving(true);
    try {
      const formData = new FormData();
      formData.set("activityId", activityId);
      formData.set("name", editForm.name);
      formData.set("timeStart", editForm.timeStart);
      formData.set("timeEnd", editForm.timeEnd);
      formData.set("location", editForm.location);
      formData.set("teacherName", editForm.teacherName);
      formData.set("className", editForm.className);
      formData.set("room", editForm.room);
      formData.set("notes", editForm.notes);
      formData.set("responsibleId", editForm.responsibleId);

      let result;
      if (editScope === "all") {
        result = await editActivityAll(formData);
      } else {
        formData.set("occurrenceDate", dateKey);
        result = await editActivityOccurrence(formData);
      }

      if (result?.error) {
        setError(result.error);
      } else {
        cancelEdit();
        router.refresh();
      }
    } catch {
      // ignore redirect errors
    } finally {
      setEditSaving(false);
    }
  }

  function getChecklistItemCompleted(activityId: string, itemId: string, serverCompleted: boolean): boolean {
    if (optimisticChecklist[activityId] && itemId in optimisticChecklist[activityId]) {
      return optimisticChecklist[activityId][itemId];
    }
    return serverCompleted;
  }

  if (!isOpen || !dateKey) return null;

  const formattedDate = new Date(dateKey + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const isOtherParentDay = dayInfo && dayInfo.userId !== currentUserId;
  const todayStr = getBrazilToday();
  const isFutureDate = dateKey >= todayStr;
  const canRequestSwap = isOtherParentDay && isFutureDate && !pendingSwapForDay;

  // Determine the responsible person for an activity on this day
  function getResponsibleName(act: ActivityInfo): string | null {
    // If there's a responsible_override in the report, use that
    if (act.report?.responsible_override) {
      return memberNames[act.report.responsible_override] || null;
    }
    // Otherwise, use custody-based responsible
    if (dayInfo) {
      return dayInfo.userName;
    }
    return null;
  }

  function getResponsibleId(act: ActivityInfo): string | null {
    if (act.report?.responsible_override) {
      return act.report.responsible_override;
    }
    if (dayInfo) {
      return dayInfo.userId;
    }
    return null;
  }

  // Get other members (not the current responsible) for the "change responsible" picker
  function getOtherMembers(act: ActivityInfo): { id: string; name: string }[] {
    const currentResponsibleId = getResponsibleId(act);
    return Object.entries(memberNames)
      .filter(([id]) => id !== currentResponsibleId)
      .map(([id, name]) => ({ id, name }));
  }

  function handleClose() {
    setShowSwapForm(false);
    setSwapType("swap");
    setProposedDate("");
    setReason("");
    setError("");
    setSuccess(false);
    setChangingResponsible(null);
    setChecklistExpanded(null);
    setOptimisticChecklist({});
    setResponsibleMode("pick");
    setSelectedNewResponsible(null);
    setEditingId(null);
    setEditScope(null);
    setEditScopePickerId(null);
    onClose();
  }

  async function handleSwapSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Validate that proposed date differs from original date for swap type
    if (swapType === "swap" && proposedDate === dateKey) {
      setError(t("calendar.proposedDateError"));
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("groupId", groupId);
      formData.set("originalDate", dateKey);
      formData.set("reason", reason);
      formData.set("targetUserId", dayInfo?.userId || "");
      formData.set("requestType", swapType);
      if (swapType === "swap" && proposedDate) {
        formData.set("proposedDate", proposedDate);
      }

      const result = await createSwapRequest(formData);

      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          handleClose();
          router.refresh();
        }, 1500);
      }
    } catch {
      setError(t("calendar.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={handleClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[80vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-dark capitalize">{formattedDate}</h3>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Day Info */}
          {dayInfo ? (
            <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: dayInfo.color + "15" }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: dayInfo.color }}
                >
                  {dayInfo.userName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm text-muted">{t("calendar.responsible")}</p>
                  <p className="font-semibold text-dark">{dayInfo.userName}</p>
                  {dayInfo.userId === currentUserId && (
                    <span className="text-xs text-primary font-medium">{t("calendar.you")}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-muted">{t("calendar.noCustodyAssigned")}</p>
            </div>
          )}

          {/* Activities for this day */}
          {activities.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-[#D4735A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4735A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {t("calendar.activities")}
              </p>
              {/* Success message after changing responsible */}
              {responsibleSuccess && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#2E7268]/10 border border-[#2E7268]/15 rounded-xl text-[12px] text-[#2E7268] font-medium animate-[fadeIn_200ms_ease-out]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2E7268" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  Responsavel alterado para <strong>{responsibleSuccess}</strong>
                </div>
              )}
              <div className="space-y-2">
                {activities.map((act) => {
                  const cat = ACTIVITY_CATEGORIES.find((c) => c.value === act.category);
                  const isPast = dateKey < todayStr;
                  const hasReport = !!act.report;
                  const statusIcon = act.report?.status === "completed" ? "\u2705" : act.report?.status === "missed" ? "\u274C" : act.report?.status === "cancelled" ? "\u{1F6AB}" : null;
                  const isExpanded = expandedId === act.id;
                  const responsibleName = getResponsibleName(act);
                  const otherMembers = getOtherMembers(act);

                  return (
                    <div key={act.id}>
                      {/* Collapsed card — click to expand */}
                      <div
                        className={`bg-[#D4735A]/[0.06] border border-[#D4735A]/15 rounded-xl overflow-hidden transition-all ${isExpanded ? "ring-2 ring-[#D4735A]/30" : ""}`}
                      >
                        {/* Header row — always visible */}
                        <div
                          className="p-3 flex items-center gap-3 cursor-pointer hover:bg-[#D4735A]/[0.08] transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : act.id)}
                        >
                          <div className="w-9 h-9 bg-[#D4735A]/10 rounded-lg flex items-center justify-center flex-shrink-0 text-base">
                            {hasReport ? statusIcon : (cat?.icon || "\u{1F4CB}")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-[#2C2C2C]">{act.name}</p>
                            <p className="text-[11px] text-[#7A8C8B]">
                              {cat?.label || act.category} · {act.childName}
                              {act.time_start && !act.all_day ? ` · ${act.time_start.slice(0, 5)}` : ""}
                              {act.all_day ? " · Dia inteiro" : ""}
                            </p>
                          </div>
                          {isPast && !hasReport && (
                            <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 flex-shrink-0 whitespace-nowrap">
                              {t("activityReport.pendingReport")}
                            </span>
                          )}
                          {hasReport && act.report?.child_mood && (
                            <span className="text-base flex-shrink-0">
                              {act.report.child_mood === "happy" ? "\u{1F60A}" : act.report.child_mood === "neutral" ? "\u{1F610}" : act.report.child_mood === "sad" ? "\u{1F622}" : act.report.child_mood === "anxious" ? "\u{1F630}" : "\u{1F634}"}
                            </span>
                          )}
                          {/* Chevron */}
                          <svg className={`w-4 h-4 text-[#7A8C8B] flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 border-t border-[#D4735A]/10">
                            <div className="pt-3 space-y-2">
                              {/* 1. Time */}
                              {(act.time_start || act.all_day) && (
                                <div className="flex items-center gap-2 text-[12px]">
                                  <span className="text-[#5B9E85]">&#x23F0;</span>
                                  <span className="text-[#2C2C2C] font-medium">
                                    {act.all_day ? t("calendar.allDay") : `${act.time_start?.slice(0, 5) || ""}${act.time_end ? ` - ${act.time_end.slice(0, 5)}` : ""}`}
                                  </span>
                                </div>
                              )}
                              {/* 2. Location */}
                              {act.location && (
                                <div className="flex items-center gap-2 text-[12px]">
                                  <span>&#x1F4CD;</span>
                                  <span className="text-[#2C2C2C]">{act.location}</span>
                                </div>
                              )}
                              {/* 3. Responsible for activity */}
                              {responsibleName && (
                                <div className="flex items-center gap-2 text-[12px]">
                                  <span>&#x1F464;</span>
                                  <span className="text-[#2C2C2C]">
                                    {t("calendar.responsibleForActivity")}: <strong>{responsibleName}</strong>
                                  </span>
                                  {otherMembers.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setChangingResponsible(changingResponsible === act.id ? null : act.id);
                                        setResponsibleMode("pick");
                                        setSelectedNewResponsible(null);
                                      }}
                                      className="ml-auto text-[10px] font-semibold text-[#D4735A] hover:text-[#D4623E] transition-colors"
                                    >
                                      {t("calendar.changeResponsible")}
                                    </button>
                                  )}
                                </div>
                              )}
                              {/* Assigned to (legacy, no responsible_name set) */}
                              {act.assigned_to_name && !responsibleName && (
                                <div className="flex items-center gap-2 text-[12px]">
                                  <span>&#x1F464;</span>
                                  <span className="text-[#2C2C2C]">{act.assigned_to_name}</span>
                                  {otherMembers.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setChangingResponsible(changingResponsible === act.id ? null : act.id);
                                        setResponsibleMode("pick");
                                        setSelectedNewResponsible(null);
                                      }}
                                      className="ml-auto text-[10px] font-semibold text-[#D4735A] hover:text-[#D4623E] transition-colors"
                                    >
                                      {t("calendar.changeResponsible")}
                                    </button>
                                  )}
                                </div>
                              )}
                              {/* No responsible assigned — show "assign" button */}
                              {!responsibleName && !act.assigned_to_name && Object.keys(memberNames).length > 0 && (
                                <div className="flex items-center gap-2 text-[12px]">
                                  <span>&#x1F464;</span>
                                  <span className="text-[#9A8878]">{t("calendar.noResponsible")}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setChangingResponsible(changingResponsible === act.id ? null : act.id);
                                      setResponsibleMode("pick");
                                      setSelectedNewResponsible(null);
                                    }}
                                    className="ml-auto text-[10px] font-semibold text-[#D4735A] hover:text-[#D4623E] transition-colors"
                                  >
                                    {t("calendar.assignResponsible")}
                                  </button>
                                </div>
                              )}
                              {/* Change responsible picker with "this day" / "all future" options */}
                              {changingResponsible === act.id && responsibleMode === "pick" && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 animate-[fadeIn_150ms_ease-out]">
                                  <p className="text-[10px] font-bold text-blue-700 uppercase mb-1.5">
                                    {t("calendar.changeResponsible")}
                                  </p>
                                  <div className="space-y-1.5">
                                    {otherMembers.map((member) => (
                                      <button
                                        key={member.id}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isRecurring(act)) {
                                            setSelectedNewResponsible(member);
                                            setResponsibleMode("confirm");
                                          } else {
                                            handleChangeResponsible(act.id, member.id);
                                          }
                                        }}
                                        disabled={responsibleSaving}
                                        className="w-full text-left px-3 py-2 text-xs bg-white border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                                      >
                                        <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-[10px]">
                                          {member.name.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="text-[#2C2C2C] font-medium">{member.name}</span>
                                        {responsibleSaving && <span className="ml-auto text-[10px] text-blue-500">...</span>}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Confirm scope: this day or all future */}
                              {changingResponsible === act.id && responsibleMode === "confirm" && selectedNewResponsible && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 animate-[fadeIn_150ms_ease-out]">
                                  <p className="text-[10px] font-bold text-blue-700 uppercase mb-1">
                                    {t("calendar.changeResponsible")} &rarr; {selectedNewResponsible.name}
                                  </p>
                                  <div className="space-y-1.5 mt-2">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleChangeResponsible(act.id, selectedNewResponsible.id); }}
                                      disabled={responsibleSaving}
                                      className="w-full px-3 py-2 text-xs bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 font-medium"
                                    >
                                      {responsibleSaving ? "..." : t("calendar.onlyThisDay")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleChangeResponsibleAll(act.id, selectedNewResponsible.id); }}
                                      disabled={responsibleSaving}
                                      className="w-full px-3 py-2 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium"
                                    >
                                      {responsibleSaving ? "..." : t("calendar.allFutureEvents")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setResponsibleMode("pick"); setSelectedNewResponsible(null); }}
                                      className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-[#7A8C8B]"
                                    >
                                      {t("common.cancel")}
                                    </button>
                                  </div>
                                </div>
                              )}
                              {/* 4. Child name */}
                              <div className="flex items-center gap-2 text-[12px]">
                                <span>&#x1F476;</span>
                                <span className="text-[#2C2C2C]">{act.childName}</span>
                              </div>
                              {/* 5. Teacher */}
                              {act.teacher_name && (
                                <div className="flex items-center gap-2 text-[12px]">
                                  <span>&#x1F469;&#x200D;&#x1F3EB;</span>
                                  <span className="text-[#2C2C2C]">{t("calendar.teacher")}: {act.teacher_name}</span>
                                </div>
                              )}
                              {/* 6. Class / Turma */}
                              {act.class_name && (
                                <div className="flex items-center gap-2 text-[12px]">
                                  <span>&#x1F4D6;</span>
                                  <span className="text-[#2C2C2C]">{t("calendar.className")}: {act.class_name}</span>
                                </div>
                              )}
                              {/* 7. Room / Sala */}
                              {act.room && (
                                <div className="flex items-center gap-2 text-[12px]">
                                  <span>&#x1F3E0;</span>
                                  <span className="text-[#2C2C2C]">{t("calendar.room")}: {act.room}</span>
                                </div>
                              )}
                              {/* 8. Notes / Description */}
                              {act.description && (
                                <div className="bg-gray-50 rounded-lg p-2.5 mt-1">
                                  <p className="text-[10px] font-bold text-[#7A8C8B] uppercase mb-1">&#x1F4DD; {t("calendar.notes") || "Notas"}</p>
                                  <p className="text-[11px] text-[#7A8C8B] whitespace-pre-wrap">{act.description}</p>
                                </div>
                              )}
                              {/* 9. Checklist — expandable with toggle */}
                              {act.checklistItems && act.checklistItems.length > 0 && (
                                <div className="mt-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setChecklistExpanded(checklistExpanded === act.id ? null : act.id);
                                    }}
                                    className="flex items-center gap-2 text-[12px] w-full"
                                  >
                                    <span>&#x2705;</span>
                                    <span className="text-[#D4735A] font-medium">
                                      {act.checklistItems.filter((item) => getChecklistItemCompleted(act.id, item.id, item.completed)).length}/{act.checklistItems.length} {t("calendar.checklistItems", { count: act.checklistItems.length }).replace(/\d+ /, "")}
                                    </span>
                                    <svg className={`w-3.5 h-3.5 text-[#7A8C8B] ml-auto transition-transform ${checklistExpanded === act.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                  {checklistExpanded === act.id && (
                                    <div className="mt-2 space-y-1 animate-[fadeIn_150ms_ease-out]">
                                      {act.checklistItems.map((item) => {
                                        const isCompleted = getChecklistItemCompleted(act.id, item.id, item.completed);
                                        return (
                                          <label
                                            key={item.id}
                                            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isCompleted}
                                              onChange={() => handleToggleChecklist(act.id, item.id, !isCompleted)}
                                              className="w-4 h-4 rounded border-gray-300 text-[#5B9E85] focus:ring-[#5B9E85]"
                                            />
                                            <span className={`text-[12px] ${isCompleted ? "line-through text-[#7A8C8B]" : "text-[#2C2C2C]"}`}>
                                              {item.name}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Checklist count fallback (no items loaded) */}
                              {(!act.checklistItems || act.checklistItems.length === 0) && act.checklistCount > 0 && (
                                <div className="flex items-center gap-2 text-[12px]">
                                  <span>&#x2705;</span>
                                  <span className="text-[#D4735A] font-medium">
                                    {act.checklistCount === 1
                                      ? t("calendar.checklistItems", { count: act.checklistCount })
                                      : t("calendar.checklistItemsPlural", { count: act.checklistCount })}
                                  </span>
                                </div>
                              )}
                              {/* 10. Report */}
                              {hasReport && (
                                <div className="bg-green-50 rounded-lg p-2.5 mt-1">
                                  <p className="text-[10px] font-bold text-green-700 uppercase mb-1">{t("activityReport.title")}</p>
                                  <p className="text-[11px] text-green-800">
                                    {act.report?.status === "completed" ? "&#x2705; " + t("activityReport.activityCompleted") : act.report?.status === "missed" ? "&#x274C; " + t("activityReport.activityMissed") : "&#x1F6AB; " + t("activityReport.activityCancelled")}
                                  </p>
                                  {act.report?.notes && (
                                    <p className="text-[11px] text-green-700 mt-1 italic">{act.report.notes}</p>
                                  )}
                                  {act.report?.child_mood && (
                                    <p className="text-[11px] text-green-700 mt-1">
                                      {t("activityReport.childMoodLabel")}: {t(`activityReport.mood_${act.report.child_mood}`)}
                                    </p>
                                  )}
                                </div>
                              )}
                              {/* Action buttons */}
                              <div className="flex items-center gap-2 pt-2">
                                <ShareActivityButton
                                  activity={{
                                    name: act.name,
                                    category: act.category,
                                    childName: act.childName,
                                    timeStr: act.time_start?.slice(0, 5) || "",
                                    location: act.location || "",
                                    checklistItems: act.checklistItems?.map((i) => i.name) || [],
                                    dateLabel: dateKey === todayStr ? t("dashboard.todayBadge") : "",
                                  }}
                                />
                                {isPast && !hasReport && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setReportActivity(act); }}
                                    className="flex-1 text-[11px] font-semibold py-2 px-3 rounded-lg bg-[#5B9E85] text-white hover:bg-[#4A8D74] transition-colors"
                                  >
                                    📝 Fazer Relatório
                                  </button>
                                )}
                                {/* Edit button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (editingId === act.id) {
                                      cancelEdit();
                                    } else if (isRecurring(act)) {
                                      setEditScopePickerId(editScopePickerId === act.id ? null : act.id);
                                    } else {
                                      startEdit(act, "all");
                                    }
                                  }}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-[#7A8C8B] hover:text-blue-500 transition-colors"
                                  title={t("calendar.edit")}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                {/* Delete button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmId(deleteConfirmId === act.id ? null : act.id);
                                  }}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-[#7A8C8B] hover:text-red-500 transition-colors"
                                  title={t("common.delete")}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                  </svg>
                                </button>
                              </div>
                              {/* Edit scope picker (recurring activities) */}
                              {editScopePickerId === act.id && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 animate-[fadeIn_150ms_ease-out]">
                                  <p className="text-xs text-blue-700 font-medium mb-1">
                                    {t("calendar.editRecurringTitle")}
                                  </p>
                                  <p className="text-[11px] text-blue-600 mb-3">
                                    &quot;{act.name}&quot;
                                  </p>
                                  <div className="space-y-2">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); startEdit(act, "this"); }}
                                      className="w-full px-3 py-2 text-xs bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                                    >
                                      {t("calendar.editOnlyThisDay")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); startEdit(act, "all"); }}
                                      className="w-full px-3 py-2 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                                    >
                                      {t("calendar.editAllEvents")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditScopePickerId(null)}
                                      className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-[#7A8C8B]"
                                    >
                                      {t("common.cancel")}
                                    </button>
                                  </div>
                                </div>
                              )}
                              {/* Inline edit form */}
                              {editingId === act.id && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 animate-[fadeIn_150ms_ease-out]">
                                  <p className="text-[10px] font-bold text-blue-700 uppercase mb-2">
                                    {t("calendar.editActivity")} {editScope === "this" ? `(${t("calendar.onlyThisDay")})` : ""}
                                  </p>
                                  <div className="space-y-2">
                                    {/* Name */}
                                    <div>
                                      <label className="text-[10px] font-semibold text-[#7A8C8B] uppercase">{t("activities.name") || "Nome"}</label>
                                      <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                        className="w-full mt-0.5 px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                    {/* Time Start / End */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[10px] font-semibold text-[#7A8C8B] uppercase">{t("activities.startTime") || "Início"}</label>
                                        <input
                                          type="time"
                                          value={editForm.timeStart}
                                          onChange={(e) => setEditForm((f) => ({ ...f, timeStart: e.target.value }))}
                                          className="w-full mt-0.5 px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-semibold text-[#7A8C8B] uppercase">{t("activities.endTime") || "Fim"}</label>
                                        <input
                                          type="time"
                                          value={editForm.timeEnd}
                                          onChange={(e) => setEditForm((f) => ({ ...f, timeEnd: e.target.value }))}
                                          className="w-full mt-0.5 px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                    </div>
                                    {/* Location */}
                                    <div>
                                      <label className="text-[10px] font-semibold text-[#7A8C8B] uppercase">{t("activities.location") || "Local"}</label>
                                      <input
                                        type="text"
                                        value={editForm.location}
                                        onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                                        className="w-full mt-0.5 px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                    {/* Teacher */}
                                    <div>
                                      <label className="text-[10px] font-semibold text-[#7A8C8B] uppercase">{t("calendar.teacher")}</label>
                                      <input
                                        type="text"
                                        value={editForm.teacherName}
                                        onChange={(e) => setEditForm((f) => ({ ...f, teacherName: e.target.value }))}
                                        className="w-full mt-0.5 px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                    {/* Class / Room */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[10px] font-semibold text-[#7A8C8B] uppercase">{t("calendar.className")}</label>
                                        <input
                                          type="text"
                                          value={editForm.className}
                                          onChange={(e) => setEditForm((f) => ({ ...f, className: e.target.value }))}
                                          className="w-full mt-0.5 px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-semibold text-[#7A8C8B] uppercase">{t("calendar.room")}</label>
                                        <input
                                          type="text"
                                          value={editForm.room}
                                          onChange={(e) => setEditForm((f) => ({ ...f, room: e.target.value }))}
                                          className="w-full mt-0.5 px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                    </div>
                                    {/* Notes */}
                                    <div>
                                      <label className="text-[10px] font-semibold text-[#7A8C8B] uppercase">{t("calendar.notes")}</label>
                                      <textarea
                                        value={editForm.notes}
                                        onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                                        rows={2}
                                        className="w-full mt-0.5 px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white resize-none"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                    {/* Responsible */}
                                    {Object.keys(memberNames).length > 0 && (
                                      <div>
                                        <label className="text-[10px] font-semibold text-[#7A8C8B] uppercase">{t("calendar.responsibleForActivity")}</label>
                                        <select
                                          value={editForm.responsibleId}
                                          onChange={(e) => setEditForm((f) => ({ ...f, responsibleId: e.target.value }))}
                                          className="w-full mt-0.5 px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <option value="">--</option>
                                          {Object.entries(memberNames).map(([id, name]) => (
                                            <option key={id} value={id}>{name}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                    {/* Save / Cancel */}
                                    <div className="flex gap-2 pt-1">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                                        className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-[#7A8C8B] font-medium"
                                      >
                                        {t("common.cancel")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleEditSave(act.id); }}
                                        disabled={editSaving}
                                        className="flex-1 px-3 py-2 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium"
                                      >
                                        {editSaving ? t("calendar.editing") : t("calendar.saveChanges")}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {/* Delete confirmation — recurring vs non-recurring */}
                              {deleteConfirmId === act.id && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 animate-[fadeIn_150ms_ease-out]">
                                  {isRecurring(act) ? (
                                    <>
                                      <p className="text-xs text-red-700 font-medium mb-1">
                                        {t("calendar.recurringActivity")}
                                      </p>
                                      <p className="text-[11px] text-red-600 mb-3">
                                        &quot;{act.name}&quot;
                                      </p>
                                      <div className="space-y-2">
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteThisDay(act.id)}
                                          disabled={deleting}
                                          className="w-full px-3 py-2 text-xs bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 font-medium"
                                        >
                                          {deleting ? "..." : t("calendar.deleteOnlyThisDay")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteAll(act.id, act.source)}
                                          disabled={deleting}
                                          className="w-full px-3 py-2 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 font-medium"
                                        >
                                          {deleting ? "..." : t("calendar.deleteAllOccurrences")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setDeleteConfirmId(null)}
                                          className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-[#7A8C8B]"
                                        >
                                          {t("common.cancel")}
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-xs text-red-700 font-medium mb-2">
                                        {t("common.confirmDelete")} &quot;{act.name}&quot;?
                                      </p>
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setDeleteConfirmId(null)}
                                          className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                                        >
                                          {t("common.cancel")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteAll(act.id, act.source)}
                                          disabled={deleting}
                                          className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                                        >
                                          {deleting ? "..." : t("common.delete")}
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity Report Modal */}
          {reportActivity && (
            <ActivityReportModal
              isOpen={!!reportActivity}
              onClose={() => setReportActivity(null)}
              activityId={reportActivity.id}
              activityName={reportActivity.name}
              childName={reportActivity.childName}
              occurrenceDate={dateKey}
              timeStart={reportActivity.time_start}
            />
          )}

          {/* Pending swap indicator */}
          {pendingSwapForDay && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-amber-700 font-medium">{t("calendar.pendingSwapForDay")}</p>
              </div>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-green-700 font-medium">{t("calendar.requestSentSuccess")}</p>
              </div>
            </div>
          )}

          {/* Swap Form */}
          {showSwapForm && !success ? (
            <form onSubmit={handleSwapSubmit} className="space-y-4">
              {/* Swap Type Toggle */}
              {isParent && (
                <div>
                  <label className="block text-sm font-medium text-[#2C2C2C] mb-2">{t("calendar.requestType")}</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSwapType("swap")}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                        swapType === "swap"
                          ? "bg-[#D4735A]/10 border-[#D4735A]/30 text-[#D4735A]"
                          : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
                      }`}
                    >
                      <svg className="w-4 h-4 inline mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      {t("calendar.swapDays")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSwapType("visit"); setProposedDate(""); }}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                        swapType === "visit"
                          ? "bg-blue-50 border-blue-200 text-blue-600"
                          : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
                      }`}
                    >
                      <svg className="w-4 h-4 inline mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {t("calendar.requestVisit")}
                    </button>
                  </div>
                </div>
              )}

              {/* Date requested summary */}
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-[#7A8C8B] mb-1">{t("calendar.requestedDay")}</p>
                <p className="text-sm font-semibold text-[#2C2C2C] capitalize">{formattedDate}</p>
                <p className="text-xs text-[#7A8C8B]">{t("calendar.responsible")}: {dayInfo?.userName}</p>
              </div>

              {/* Proposed date picker (only for swap type) */}
              {swapType === "swap" && (
                <div>
                  <label className="block text-sm font-medium text-[#2C2C2C] mb-1">
                    {t("calendar.dayYouOffer")}
                  </label>
                  <p className="text-xs text-[#7A8C8B] mb-2">{t("calendar.chooseDay", { name: dayInfo?.userName.split(" ")[0] || "" })}</p>
                  <input
                    type="date"
                    value={proposedDate}
                    onChange={(e) => setProposedDate(e.target.value)}
                    min={todayStr}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4735A]/50 text-sm text-[#2C2C2C]"
                  />
                  {!proposedDate && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {t("calendar.noSwapDateDebt")}
                    </p>
                  )}
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-[#2C2C2C] mb-1">
                  {t("calendar.reason")} ({t("common.optional")})
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={swapType === "swap"
                    ? t("calendar.reasonPlaceholderSwap")
                    : t("calendar.reasonPlaceholderVisit")
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4735A]/50 resize-none text-sm"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSwapForm(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 text-[#2C2C2C] font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  {t("common.back")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-3 bg-[#D4735A] text-white font-semibold rounded-xl hover:bg-[#D4623E] transition-colors disabled:opacity-50"
                >
                  {submitting ? t("calendar.submitting") : (swapType === "swap" ? t("calendar.requestSwapButton") : t("calendar.requestVisitButton"))}
                </button>
              </div>
            </form>
          ) : !success ? (
            /* Action Buttons */
            <div className="space-y-2">
              {canRequestSwap && (
                <button
                  onClick={() => setShowSwapForm(true)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-primary/5 border border-primary/20 rounded-xl hover:bg-primary/10 transition-colors"
                >
                  <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-primary">{t("calendar.swapDay")}</p>
                    <p className="text-xs text-muted">{t("calendar.requestSwapWith", { name: dayInfo?.userName.split(" ")[0] || "" })}</p>
                  </div>
                </button>
              )}

              {!isParent && isOtherParentDay && isFutureDate && (
                <button
                  onClick={() => setShowSwapForm(true)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-blue-600">{t("calendar.visitDay")}</p>
                    <p className="text-xs text-muted">{t("calendar.askVisit")}</p>
                  </div>
                </button>
              )}

              {!canRequestSwap && !pendingSwapForDay && dayInfo && dayInfo.userId === currentUserId && (
                <div className="text-center py-2">
                  <p className="text-xs text-muted">{t("calendar.dayAlreadyYours")}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});
