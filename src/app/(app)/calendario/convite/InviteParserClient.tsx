"use client";

import { useState, useRef, useCallback } from "react";
import { createEvent } from "@/actions/events";
import { useI18n } from "@/i18n/provider";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  groupId: string;
  childrenList: { id: string; full_name: string }[];
}

interface ParsedEvent {
  title: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
}

type Step = "upload" | "processing" | "preview" | "error";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function InviteParserClient({ groupId, childrenList }: Props) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [childId, setChildId] = useState<string>("");

  /* ---- Upload handler ---- */
  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setError(null);

      // Show image preview
      if (selectedFile.type.startsWith("image/")) {
        const url = URL.createObjectURL(selectedFile);
        setPreview(url);
      } else {
        setPreview(null);
      }

      // Start processing
      setStep("processing");

      try {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const res = await fetch("/api/ai/parse-invite", {
          method: "POST",
          body: formData,
        });

        const result = await res.json();

        if (result.success && result.data) {
          setParsed(result.data);
          setStep("preview");
        } else {
          setError(
            result.error || t("inviteParser.errorGeneric")
          );
          setStep("error");
        }
      } catch {
        setError(t("inviteParser.errorNetwork"));
        setStep("error");
      }
    },
    [t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) handleFileSelect(selected);
    },
    [handleFileSelect]
  );

  /* ---- Edit handler ---- */
  const updateField = (field: keyof ParsedEvent, value: string) => {
    if (!parsed) return;
    setParsed({ ...parsed, [field]: value || null });
  };

  /* ---- Save handler ---- */
  const handleConfirm = async () => {
    if (!parsed?.title || !parsed?.date) return;

    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("groupId", groupId);
      formData.set("title", parsed.title);
      formData.set("eventDate", parsed.date);
      if (parsed.start_time) formData.set("eventTime", parsed.start_time);
      if (parsed.location) formData.set("description", parsed.location);
      if (parsed.notes) {
        const desc = [parsed.location, parsed.notes].filter(Boolean).join("\n\n");
        formData.set("description", desc);
      }
      if (parsed.location) formData.set("location", parsed.location);
      if (childId) formData.set("childId", childId);
      // Attach original image
      if (file) formData.set("image", file);

      await createEvent(formData);
      // createEvent redirects on success
    } catch {
      setError(t("inviteParser.errorSave"));
      setSaving(false);
    }
  };

  /* ---- Retry ---- */
  const handleRetry = () => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setParsed(null);
    setError(null);
    setEditing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <Link
          href="/calendario/novo"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F5F0EB] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="#0E0C0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <h1 className="text-lg font-semibold text-[#0E0C0A]">
          {t("inviteParser.title")}
        </h1>
      </div>

      <div className="px-4">
        {/* ---- STEP: Upload ---- */}
        {step === "upload" && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-[#E8E0D4] rounded-2xl p-8 text-center hover:border-[#C07055] transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleInputChange}
              className="hidden"
            />
            <div className="w-16 h-16 mx-auto mb-4 bg-[#FDF0EC] rounded-2xl flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M21 15V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V15" stroke="#C07055" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 8L12 3L7 8" stroke="#C07055" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 3V15" stroke="#C07055" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[#0E0C0A] font-medium mb-1">
              {t("inviteParser.uploadTitle")}
            </p>
            <p className="text-[#9A8878] text-sm">
              {t("inviteParser.uploadHint")}
            </p>
          </div>
        )}

        {/* ---- STEP: Processing ---- */}
        {step === "processing" && (
          <div className="bg-white rounded-2xl border border-[#E8E0D4] p-8 text-center">
            {preview && (
              <div className="mb-6 rounded-xl overflow-hidden max-h-48 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Convite"
                  className="max-h-48 object-contain rounded-xl"
                />
              </div>
            )}
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#C07055] mx-auto mb-4" />
            <p className="text-[#0E0C0A] font-medium">
              {t("inviteParser.processing")}
            </p>
            <p className="text-[#9A8878] text-sm mt-1">
              {t("inviteParser.processingHint")}
            </p>
          </div>
        )}

        {/* ---- STEP: Preview ---- */}
        {step === "preview" && parsed && (
          <div className="space-y-4">
            {/* Image preview */}
            {preview && (
              <div className="rounded-2xl overflow-hidden border border-[#E8E0D4] max-h-40 flex justify-center bg-[#FAFAF8]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Convite"
                  className="max-h-40 object-contain"
                />
              </div>
            )}

            {/* Event card */}
            <div className="bg-white rounded-2xl border border-[#E8E0D4] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#9A8878] uppercase tracking-wider">
                  {t("inviteParser.detectedEvent")}
                </h2>
                <button
                  onClick={() => setEditing(!editing)}
                  className="text-sm text-[#C07055] font-medium hover:underline"
                >
                  {editing ? t("common.close") : t("common.edit")}
                </button>
              </div>

              {editing ? (
                /* ---- Edit mode ---- */
                <div className="space-y-3">
                  <FieldInput
                    label={t("inviteParser.fieldTitle")}
                    value={parsed.title || ""}
                    onChange={(v) => updateField("title", v)}
                    required
                  />
                  <FieldInput
                    label={t("inviteParser.fieldDate")}
                    value={parsed.date || ""}
                    onChange={(v) => updateField("date", v)}
                    type="date"
                    required
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FieldInput
                      label={t("inviteParser.fieldStartTime")}
                      value={parsed.start_time || ""}
                      onChange={(v) => updateField("start_time", v)}
                      type="time"
                    />
                    <FieldInput
                      label={t("inviteParser.fieldEndTime")}
                      value={parsed.end_time || ""}
                      onChange={(v) => updateField("end_time", v)}
                      type="time"
                    />
                  </div>
                  <FieldInput
                    label={t("inviteParser.fieldLocation")}
                    value={parsed.location || ""}
                    onChange={(v) => updateField("location", v)}
                  />
                  <FieldInput
                    label={t("inviteParser.fieldNotes")}
                    value={parsed.notes || ""}
                    onChange={(v) => updateField("notes", v)}
                    multiline
                  />
                </div>
              ) : (
                /* ---- Display mode ---- */
                <div className="space-y-3">
                  {parsed.title && (
                    <div className="flex items-start gap-3">
                      <span className="text-xl">🎉</span>
                      <div>
                        <p className="text-xs text-[#9A8878]">{t("inviteParser.fieldTitle")}</p>
                        <p className="text-[#0E0C0A] font-semibold">{parsed.title}</p>
                      </div>
                    </div>
                  )}
                  {parsed.date && (
                    <div className="flex items-start gap-3">
                      <span className="text-xl">📅</span>
                      <div>
                        <p className="text-xs text-[#9A8878]">{t("inviteParser.fieldDate")}</p>
                        <p className="text-[#0E0C0A]">{formatDateBR(parsed.date)}</p>
                      </div>
                    </div>
                  )}
                  {(parsed.start_time || parsed.end_time) && (
                    <div className="flex items-start gap-3">
                      <span className="text-xl">⏰</span>
                      <div>
                        <p className="text-xs text-[#9A8878]">{t("inviteParser.fieldTime")}</p>
                        <p className="text-[#0E0C0A]">
                          {parsed.start_time || "?"}
                          {parsed.end_time ? ` - ${parsed.end_time}` : ""}
                        </p>
                      </div>
                    </div>
                  )}
                  {parsed.location && (
                    <div className="flex items-start gap-3">
                      <span className="text-xl">📍</span>
                      <div>
                        <p className="text-xs text-[#9A8878]">{t("inviteParser.fieldLocation")}</p>
                        <p className="text-[#0E0C0A]">{parsed.location}</p>
                      </div>
                    </div>
                  )}
                  {parsed.notes && (
                    <div className="flex items-start gap-3">
                      <span className="text-xl">📝</span>
                      <div>
                        <p className="text-xs text-[#9A8878]">{t("inviteParser.fieldNotes")}</p>
                        <p className="text-[#0E0C0A] text-sm">{parsed.notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Child selector */}
            {childrenList.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E8E0D4] p-4">
                <label className="block text-sm font-medium text-[#0E0C0A] mb-2">
                  {t("inviteParser.selectChild")}
                </label>
                <select
                  value={childId}
                  onChange={(e) => setChildId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D4] text-[#0E0C0A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C07055]/40"
                >
                  <option value="">{t("inviteParser.noChild")}</option>
                  {childrenList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Validation warning */}
            {(!parsed.title || !parsed.date) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                {t("inviteParser.missingRequired")}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="flex-1 py-3 px-4 border border-[#E8E0D4] text-[#0E0C0A] font-medium rounded-xl hover:bg-[#F5F0EB] transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving || !parsed.title || !parsed.date}
                className="flex-1 py-3 px-4 bg-[#C07055] text-white font-semibold rounded-xl hover:bg-[#A85D47] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? t("inviteParser.saving") : t("inviteParser.confirm")}
              </button>
            </div>
          </div>
        )}

        {/* ---- STEP: Error ---- */}
        {step === "error" && (
          <div className="bg-white rounded-2xl border border-[#E8E0D4] p-6 text-center space-y-4">
            {preview && (
              <div className="rounded-xl overflow-hidden max-h-32 flex justify-center mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Convite"
                  className="max-h-32 object-contain rounded-xl opacity-60"
                />
              </div>
            )}
            <div className="w-14 h-14 mx-auto bg-red-50 rounded-2xl flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="1.5"/>
                <path d="M12 8V12M12 16H12.01" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-[#0E0C0A] font-medium">{t("inviteParser.errorTitle")}</p>
            <p className="text-[#9A8878] text-sm">{error}</p>
            <button
              onClick={handleRetry}
              className="w-full py-3 px-4 bg-[#C07055] text-white font-semibold rounded-xl hover:bg-[#A85D47] transition-colors"
            >
              {t("inviteParser.retry")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  required,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  const cls =
    "w-full px-3 py-2.5 rounded-lg border border-[#E8E0D4] text-[#0E0C0A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 text-sm";

  return (
    <div>
      <label className="block text-xs font-medium text-[#9A8878] mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={cls}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
    </div>
  );
}

function formatDateBR(iso: string): string {
  try {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}
