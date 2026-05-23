"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createVaccinationRecordsBulk } from "@/actions/health";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  detectVaccineWarnings,
  shouldPreUncheck,
  type VaccineWarning,
  type ExistingVaccinationRecord,
} from "@/lib/vaccine-card-helpers";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  groupId: string;
  childId: string;
  /** birth_date da criança em ISO YYYY-MM-DD — define mínimo do date input. */
  childBirthDate?: string | null;
}

interface ParsedVaccine {
  vaccine_name: string;
  dose_label: string | null;
  administered_date: string | null;
  batch_number: string | null;
  location: string | null;
  selected: boolean;
  /** Confidence média do OCR (0..1) — populada pela AI (PR-7). */
  confidence_score?: number | null;
  date_confidence?: number | null;
  /** Warnings detectados localmente (dup, old_annual, low_confidence). */
  warnings?: VaccineWarning[];
}

type Step = "upload" | "processing" | "preview" | "error";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function VaccineParserClient({ groupId, childId, childBirthDate }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [preview, setPreview] = useState<string | null>(null);
  const [vaccines, setVaccines] = useState<ParsedVaccine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<ExistingVaccinationRecord[]>([]);

  const selectedCount = vaccines.filter((v) => v.selected).length;

  // Pré-carrega vaccination_records do child pra dup detection (silencioso —
  // se falhar, simplesmente não detecta dup no client; banco ainda dedupe
  // pelo trigger ON CONFLICT e pelo motor recompute).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("vaccination_records")
          .select("vaccine_name, administered_date, catalog_id")
          .eq("child_id", childId);
        if (!cancelled && data) {
          setExisting(
            (data as Array<{ vaccine_name: string | null; administered_date: string | null; catalog_id: string | null }>).map((r) => ({
              vaccine_name: String(r.vaccine_name || ""),
              administered_date: r.administered_date,
              catalog_id: r.catalog_id,
            })),
          );
        }
      } catch {
        /* dup detection é nice-to-have */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  // Limite máximo do date input = hoje (ISO YYYY-MM-DD)
  const todayIso = new Date().toISOString().slice(0, 10);
  const minDateIso = childBirthDate ?? "2000-01-01";

  /* ---- Upload handler ---- */
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setError(null);

    if (selectedFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(selectedFile);
      setPreview(url);
    } else {
      setPreview(null);
    }

    setStep("processing");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/ai/parse-vaccines", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (result.success && result.vaccines?.length > 0) {
        const now = new Date();
        // Enrichment local: detecta warnings + pré-desmarca duplicates
        // ANTES de mostrar preview. Tela do user reflete a decisão imediata
        // em vez de esperar feedback do server pós-submit.
        const enriched: ParsedVaccine[] = result.vaccines.map((v: Record<string, unknown>) => {
          const base: ParsedVaccine = {
            vaccine_name: String(v.vaccine_name ?? ""),
            dose_label: v.dose_label ? String(v.dose_label) : null,
            administered_date: v.administered_date ? String(v.administered_date) : null,
            batch_number: v.batch_number ? String(v.batch_number) : null,
            location: v.location ? String(v.location) : null,
            selected: true,
            confidence_score:
              typeof v.confidence_score === "number" && v.confidence_score >= 0 && v.confidence_score <= 1
                ? v.confidence_score
                : null,
            date_confidence:
              typeof v.date_confidence === "number" && v.date_confidence >= 0 && v.date_confidence <= 1
                ? v.date_confidence
                : null,
          };
          const warnings = detectVaccineWarnings(base, existing, now);
          return { ...base, warnings, selected: !shouldPreUncheck(warnings) };
        });
        setVaccines(enriched);
        setStep("preview");
      } else {
        setError(
          result.error ||
            "Nao foi possivel ler a carteirinha. Tente com uma foto mais nitida."
        );
        setStep("error");
      }
    } catch {
      setError("Erro de conexao. Verifique sua internet e tente novamente.");
      setStep("error");
    }
  }, [existing]);

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

  /* ---- Edit handlers ---- */
  const updateVaccine = (
    index: number,
    field: keyof Omit<ParsedVaccine, "selected">,
    value: string
  ) => {
    setVaccines((prev) =>
      prev.map((v, i) =>
        i === index ? { ...v, [field]: value || null } : v
      )
    );
  };

  const toggleVaccine = (index: number) => {
    setVaccines((prev) =>
      prev.map((v, i) =>
        i === index ? { ...v, selected: !v.selected } : v
      )
    );
  };

  const removeVaccine = (index: number) => {
    setVaccines((prev) => prev.filter((_, i) => i !== index));
  };

  /* ---- Save handler ---- */
  const handleSave = async () => {
    const toSave = vaccines.filter((v) => v.selected && v.vaccine_name);
    if (toSave.length === 0) return;

    setSaving(true);
    try {
      const result = await createVaccinationRecordsBulk(
        groupId,
        childId,
        toSave.map((v) => ({
          vaccine_name: v.vaccine_name,
          dose_label: v.dose_label,
          administered_date: v.administered_date,
          batch_number: v.batch_number,
          location: v.location,
          confidence_score: v.confidence_score ?? null,
        })),
        "ocr",
      );

      if (!result.success) {
        setError(`Erro ao salvar: ${result.error}`);
        setSaving(false);
        return;
      }

      router.push(
        `/saude/vacinas?crianca=${childId}&success=${encodeURIComponent(
          `${result.savedCount} vacina(s) registrada(s) com sucesso`
        )}`
      );
    } catch {
      setError("Erro ao salvar as vacinas. Tente novamente.");
      setSaving(false);
    }
  };

  /* ---- Retry ---- */
  const handleRetry = () => {
    setStep("upload");
    setPreview(null);
    setVaccines([]);
    setError(null);
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
          href={`/saude/vacinas?crianca=${childId}`}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F5F0EB] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M12.5 15L7.5 10L12.5 5"
              stroke="#0E0C0A"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className="text-lg font-semibold text-[#0E0C0A]">
          Ler Carteirinha
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
                <path
                  d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 3H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z"
                  stroke="#C07055"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="13"
                  r="4"
                  stroke="#C07055"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <p className="text-[#0E0C0A] font-medium mb-1">
              Tire uma foto ou envie a imagem da carteirinha
            </p>
            <p className="text-[#9A8878] text-sm">
              Aceita JPG, PNG, WebP ou PDF (max 10MB)
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
                  alt="Carteirinha"
                  className="max-h-48 object-contain rounded-xl"
                />
              </div>
            )}
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#C07055] mx-auto mb-4" />
            <p className="text-[#0E0C0A] font-medium">
              Lendo carteirinha...
            </p>
            <p className="text-[#9A8878] text-sm mt-1">
              Identificando vacinas na imagem
            </p>
          </div>
        )}

        {/* ---- STEP: Preview ---- */}
        {step === "preview" && vaccines.length > 0 && (
          <div className="space-y-4">
            {/* Image preview */}
            {preview && (
              <div className="rounded-2xl overflow-hidden border border-[#E8E0D4] max-h-40 flex justify-center bg-[#FAFAF8]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Carteirinha"
                  className="max-h-40 object-contain"
                />
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#9A8878] uppercase tracking-wider">
                {vaccines.length} vacina(s) encontrada(s)
              </h2>
            </div>

            {/* Vaccine list */}
            <div className="space-y-3">
              {vaccines.map((vaccine, idx) => {
                const warnings = vaccine.warnings ?? [];
                const hasDup = warnings.some((w) => w.kind === "duplicate");
                const hasOldAnnual = warnings.some((w) => w.kind === "old_annual");
                const hasLowConf = warnings.some((w) => w.kind === "low_confidence");
                return (
                <div
                  key={idx}
                  className={`bg-white rounded-2xl border p-4 space-y-3 transition-opacity ${
                    vaccine.selected
                      ? "border-[#E8E0D4]"
                      : "border-gray-200 opacity-50"
                  }`}
                >
                  {/* Row: checkbox + name + remove */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleVaccine(idx)}
                      className="w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        borderColor: vaccine.selected ? "#C07055" : "#E8E0D4",
                        backgroundColor: vaccine.selected
                          ? "#C07055"
                          : "transparent",
                      }}
                      aria-label={
                        vaccine.selected ? "Desmarcar vacina" : "Marcar vacina"
                      }
                    >
                      {vaccine.selected && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M5 13l4 4L19 7"
                            stroke="white"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={vaccine.vaccine_name}
                        onChange={(e) =>
                          updateVaccine(idx, "vaccine_name", e.target.value)
                        }
                        className="w-full text-sm font-semibold text-[#0E0C0A] bg-transparent border-b border-transparent hover:border-[#E8E0D4] focus:border-[#C07055] focus:outline-none py-1 transition-colors"
                        placeholder="Nome da vacina"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVaccine(idx)}
                      className="text-xs text-red-400 hover:text-red-600 font-medium flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label="Remover vacina"
                    >
                      Remover
                    </button>
                  </div>

                  {/* Warning chips — sinais visuais que orientam revisão antes
                      do submit. Dup vermelho desmarca (sinal forte); demais
                      mantêm marcado mas pedem conferência. Paridade com native. */}
                  {warnings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {hasDup && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-50 text-red-700 border border-red-100"
                          aria-label="Vacina já registrada — desmarcada por padrão"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                            <path d="M8 3v3M16 3v3M3 9h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          Já registrado
                        </span>
                      )}
                      {hasOldAnnual && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-100"
                          aria-label="Vacina anual com data antiga — verifique o ano"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                            <path d="M12 9v4m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Confira o ano
                        </span>
                      )}
                      {hasLowConf && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-50 text-gray-600 border border-gray-200"
                          aria-label="OCR reconheceu com baixa confiança — revise os dados"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                          </svg>
                          Revisar
                        </span>
                      )}
                    </div>
                  )}

                  {/* Fields */}
                  {vaccine.selected && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-[#9A8878] mb-0.5">
                          Dose
                        </label>
                        <input
                          type="text"
                          value={vaccine.dose_label || ""}
                          onChange={(e) =>
                            updateVaccine(idx, "dose_label", e.target.value)
                          }
                          className="w-full px-2.5 py-2 rounded-lg border border-[#E8E0D4] text-[#0E0C0A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 text-xs"
                          placeholder="1a dose, Reforco..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-[#9A8878] mb-0.5">
                          Data
                        </label>
                        <input
                          type="date"
                          value={vaccine.administered_date || ""}
                          min={minDateIso}
                          max={todayIso}
                          onChange={(e) =>
                            updateVaccine(
                              idx,
                              "administered_date",
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-2 rounded-lg border border-[#E8E0D4] text-[#0E0C0A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-[#9A8878] mb-0.5">
                          Lote
                        </label>
                        <input
                          type="text"
                          value={vaccine.batch_number || ""}
                          onChange={(e) =>
                            updateVaccine(idx, "batch_number", e.target.value)
                          }
                          className="w-full px-2.5 py-2 rounded-lg border border-[#E8E0D4] text-[#0E0C0A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 text-xs"
                          placeholder="Opcional"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-[#9A8878] mb-0.5">
                          Local
                        </label>
                        <input
                          type="text"
                          value={vaccine.location || ""}
                          onChange={(e) =>
                            updateVaccine(idx, "location", e.target.value)
                          }
                          className="w-full px-2.5 py-2 rounded-lg border border-[#E8E0D4] text-[#0E0C0A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 text-xs"
                          placeholder="Opcional"
                        />
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pb-4">
              <button
                onClick={handleRetry}
                className="flex-1 py-3 px-4 border border-[#E8E0D4] text-[#0E0C0A] font-medium rounded-xl hover:bg-[#F5F0EB] transition-colors min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || selectedCount === 0}
                className="flex-1 py-3 px-4 bg-[#C07055] text-white font-semibold rounded-xl hover:bg-[#A85D47] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {saving
                  ? "Salvando..."
                  : `Salvar ${selectedCount} vacina(s)`}
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
                  alt="Carteirinha"
                  className="max-h-32 object-contain rounded-xl opacity-60"
                />
              </div>
            )}
            <div className="w-14 h-14 mx-auto bg-red-50 rounded-2xl flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="#EF4444"
                  strokeWidth="1.5"
                />
                <path
                  d="M12 8V12M12 16H12.01"
                  stroke="#EF4444"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-[#0E0C0A] font-medium">
              Nao foi possivel ler a carteirinha
            </p>
            <p className="text-[#9A8878] text-sm">{error}</p>
            <button
              onClick={handleRetry}
              className="w-full py-3 px-4 bg-[#C07055] text-white font-semibold rounded-xl hover:bg-[#A85D47] transition-colors min-h-[44px]"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
