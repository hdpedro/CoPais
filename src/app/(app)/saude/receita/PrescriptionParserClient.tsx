"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { savePrescriptionToHealth } from "@/actions/health";
import Link from "next/link";
import type { PlanTier } from "@/lib/subscription";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  groupId: string;
  childId: string;
  childName: string;
  childBirthDate: string;
  tier: PlanTier;
  activeEpisodes: { id: string; title: string }[];
}

interface ParsedMed {
  name: string;
  normalized_name: string;
  dosage: string;
  frequency: string;
  duration: string | null;
  route: string | null;
  notes: string | null;
  selected: boolean;
}

interface ClinicalInf {
  medication_normalized_name: string;
  possible_conditions: string[];
  category: string;
  severity_level: string;
  confidence: number;
  common_usage_note: string;
}

interface AlertItem {
  type: string;
  message: string;
  severity: string;
}

interface InferenceResult {
  id: string;
  prescription_data: Record<string, unknown>;
  medications_parsed: ParsedMed[];
  clinical_inferences: ClinicalInf[];
  history_context: {
    recent_antibiotics?: { name: string; date: string }[];
    recurrence_patterns?: { condition: string; count: number; last_date: string }[];
    related_symptoms?: { type: string; date: string; intensity: string | null }[];
    allergy_conflicts?: { medication: string; allergy_name: string; severity: string }[];
  };
  ai_summary: string | null;
  alerts: AlertItem[];
  inference_confidence: number | null;
  processing_status: string;
  source_image_url: string | null;
}

type Step = "upload" | "processing" | "results" | "editing" | "saving" | "error";
type ProcessingStep = 0 | 1 | 2 | 3;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function PrescriptionParserClient({
  groupId, childId, childName, activeEpisodes,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [processingStep, setProcessingStep] = useState<ProcessingStep>(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [medications, setMedications] = useState<ParsedMed[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkedEpisodeId, setLinkedEpisodeId] = useState<string>("");
  const [createEpisode, setCreateEpisode] = useState(false);
  const [episodeTitle, setEpisodeTitle] = useState("");

  const selectedCount = medications.filter((m) => m.selected).length;

  /* ---- Processing step labels ---- */
  const processingLabels = [
    "Lendo receita...",
    "Identificando medicamentos...",
    "Cruzando com historico...",
    "Gerando resumo...",
  ];

  /* ---- Upload handler ---- */
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setError(null);

    if (selectedFile.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(selectedFile));
    }

    setStep("processing");
    setProcessingStep(0);

    // Animate processing steps
    const stepTimer = setInterval(() => {
      setProcessingStep((prev) => (prev < 3 ? ((prev + 1) as ProcessingStep) : prev));
    }, 2000);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("childId", childId);
      formData.append("groupId", groupId);

      const res = await fetch("/api/ai/parse-prescription", {
        method: "POST",
        body: formData,
      });

      clearInterval(stepTimer);
      setProcessingStep(3);

      const result = await res.json();

      if (result.success && result.inference) {
        setInference(result.inference);
        setMedications(
          (result.inference.medications_parsed || []).map((m: ParsedMed) => ({ ...m, selected: true }))
        );
        setStep("results");
      } else {
        setError(result.error || "Nao foi possivel processar a receita.");
        setStep("error");
      }
    } catch {
      clearInterval(stepTimer);
      setError("Erro ao enviar a receita. Tente novamente.");
      setStep("error");
    }
  }, [childId, groupId]);

  /* ---- Save handler ---- */
  const handleSave = async () => {
    if (!inference) return;
    setSaving(true);
    setStep("saving");

    try {
      const fd = new FormData();
      fd.set("inferenceId", inference.id);
      fd.set("groupId", groupId);
      fd.set("childId", childId);
      fd.set("selectedMedications", JSON.stringify(
        medications.map((m, i) => m.selected ? i : -1).filter((i) => i >= 0)
      ));
      if (linkedEpisodeId) fd.set("episodeId", linkedEpisodeId);
      fd.set("createEpisode", String(createEpisode));
      if (episodeTitle) fd.set("episodeTitle", episodeTitle);

      const result = await savePrescriptionToHealth(fd);

      if (result?.error) {
        setError(result.error);
        setStep("error");
      } else {
        router.push("/saude/medicamentos?success=" + encodeURIComponent(`${selectedCount} medicamento(s) salvo(s)`));
        router.refresh();
      }
    } catch {
      setError("Erro ao salvar. Tente novamente.");
      setStep("error");
    } finally {
      setSaving(false);
    }
  };

  /* ---- Toggle medication selection ---- */
  const toggleMed = (index: number) => {
    setMedications((prev) => prev.map((m, i) => i === index ? { ...m, selected: !m.selected } : m));
  };

  /* ---- Confidence badge color ---- */
  const confidenceColor = (c: number) => {
    if (c >= 0.7) return "bg-green-100 text-green-700";
    if (c >= 0.4) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-600";
  };

  const confidenceLabel = (c: number) => {
    if (c >= 0.7) return "Alta";
    if (c >= 0.4) return "Media";
    return "Baixa";
  };

  const severityColor = (s: string) => {
    if (s === "grave") return "bg-red-100 text-red-700";
    if (s === "moderado") return "bg-amber-100 text-amber-700";
    return "bg-green-100 text-green-700";
  };

  /* ================================================================== */
  /* RENDER                                                              */
  /* ================================================================== */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/saude" className="w-9 h-9 flex items-center justify-center rounded-xl bg-white shadow-sm">
          <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-dark">Receita de {childName}</h1>
          <p className="text-xs text-muted">Envie uma foto da receita medica</p>
        </div>
      </div>

      {/* ---- STATE: UPLOAD ---- */}
      {step === "upload" && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="bg-white rounded-2xl shadow-sm p-8 text-center cursor-pointer hover:shadow-md hover:border-primary/30 border-2 border-dashed border-gray-200 transition-all active:scale-[0.98]"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-dark mb-1">Tirar foto ou escolher imagem</p>
          <p className="text-sm text-muted">JPG, PNG ou PDF (max 10MB)</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
        </div>
      )}

      {/* ---- STATE: PROCESSING ---- */}
      {step === "processing" && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          {preview && (
            <div className="mb-4 rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Receita" className="w-full max-h-48 object-cover opacity-60" />
            </div>
          )}
          <div className="space-y-3">
            {processingLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  i < processingStep ? "bg-green-500" :
                  i === processingStep ? "bg-indigo-500 animate-pulse" :
                  "bg-gray-200"
                }`}>
                  {i < processingStep ? (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : i === processingStep ? (
                    <div className="w-2 h-2 bg-white rounded-full" />
                  ) : null}
                </div>
                <span className={`text-sm ${
                  i <= processingStep ? "text-dark font-medium" : "text-muted"
                }`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- STATE: RESULTS ---- */}
      {step === "results" && inference && (
        <>
          {/* Card 1: Receita identificada */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">💊</span>
              <h2 className="text-sm font-bold text-dark">Receita identificada</h2>
              {inference.inference_confidence != null && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ml-auto ${confidenceColor(inference.inference_confidence)}`}>
                  {confidenceLabel(inference.inference_confidence)}
                </span>
              )}
            </div>

            {/* Prescription metadata */}
            {(() => {
              const doctorName = inference.prescription_data.doctor_name as string | null;
              const prescDate = inference.prescription_data.prescription_date as string | null;
              if (!doctorName && !prescDate) return null;
              return (
                <div className="flex flex-wrap gap-2 mb-3 text-xs text-muted">
                  {doctorName && <span>Dr(a). {doctorName}</span>}
                  {prescDate && <span>{new Date(prescDate + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
                </div>
              );
            })()}

            {/* Medications list */}
            <div className="space-y-2">
              {medications.map((med, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  med.selected ? "border-indigo-200 bg-indigo-50/50" : "border-gray-100 bg-gray-50/50 opacity-60"
                }`}>
                  <button type="button" onClick={() => toggleMed(i)} className="mt-0.5 shrink-0">
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      med.selected ? "bg-indigo-500 border-indigo-500" : "border-gray-300"
                    }`}>
                      {med.selected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-dark">{med.name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted mt-0.5">
                      {med.dosage && <span>{med.dosage}</span>}
                      {med.frequency && <span>{med.frequency}</span>}
                      {med.duration && <span>{med.duration}</span>}
                      {med.route && <span>({med.route})</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep("editing")}
              className="w-full mt-3 py-2 text-xs text-indigo-600 font-medium hover:bg-indigo-50 rounded-lg transition-colors"
            >
              Editar manualmente
            </button>
          </div>

          {/* Card 2: Possiveis indicacoes (premium) */}
          {inference.clinical_inferences.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🔍</span>
                <h2 className="text-sm font-bold text-dark">Possiveis indicacoes</h2>
              </div>
              <div className="space-y-3">
                {inference.clinical_inferences.map((inf, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-dark">{inf.medication_normalized_name}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${severityColor(inf.severity_level)}`}>
                        {inf.severity_level}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-auto ${confidenceColor(inf.confidence)}`}>
                        {Math.round(inf.confidence * 100)}%
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {inf.possible_conditions.map((c, j) => (
                        <span key={j} className="text-[11px] px-2 py-0.5 bg-white border border-gray-200 rounded-full text-dark/80">
                          {c}
                        </span>
                      ))}
                    </div>
                    {inf.common_usage_note && (
                      <p className="text-[11px] text-muted italic">{inf.common_usage_note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card 3: Contexto do historico (premium) */}
          {(inference.history_context.recent_antibiotics?.length ||
            inference.history_context.recurrence_patterns?.length ||
            inference.history_context.related_symptoms?.length) ? (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📋</span>
                <h2 className="text-sm font-bold text-dark">Contexto de {childName}</h2>
              </div>
              <div className="space-y-2">
                {inference.history_context.recent_antibiotics?.map((a, i) => (
                  <div key={`ab-${i}`} className="flex items-center gap-2 text-xs p-2 bg-amber-50 rounded-lg">
                    <span>💊</span>
                    <span className="text-amber-800">Antibiotico recente: {a.name} ({new Date(a.date + "T12:00:00").toLocaleDateString("pt-BR")})</span>
                  </div>
                ))}
                {inference.history_context.recurrence_patterns?.map((r, i) => (
                  <div key={`rec-${i}`} className="flex items-center gap-2 text-xs p-2 bg-blue-50 rounded-lg">
                    <span>🔁</span>
                    <span className="text-blue-800">Possivel recorrencia: &quot;{r.condition}&quot; ({r.count}x nos ultimos 6 meses)</span>
                  </div>
                ))}
                {(inference.history_context.related_symptoms?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-2 text-xs p-2 bg-purple-50 rounded-lg">
                    <span>🌡️</span>
                    <span className="text-purple-800">
                      Sintomas recentes: {inference.history_context.related_symptoms?.map((s) => s.type).join(", ")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Card 4: Alertas */}
          {inference.alerts.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">⚠️</span>
                <h2 className="text-sm font-bold text-dark">Atencao</h2>
              </div>
              <div className="space-y-2">
                {inference.alerts.map((alert, i) => (
                  <div key={i} className={`p-3 rounded-xl text-xs ${
                    alert.severity === "critical"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}>
                    {alert.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Summary */}
          {inference.ai_summary && (
            <div className="bg-indigo-50 rounded-2xl p-4">
              <p className="text-xs text-indigo-800 leading-relaxed">{inference.ai_summary}</p>
            </div>
          )}

          {/* Disclaimer */}
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <p className="text-[11px] text-muted text-center leading-relaxed">
              Informacoes geradas por IA para contexto informativo. Nao substitui orientacao medica. Consulte sempre o pediatra.
            </p>
          </div>

          {/* Link to episode */}
          {activeEpisodes.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <label className="text-xs font-semibold text-dark block mb-2">Vincular a doenca existente</label>
              <select
                value={linkedEpisodeId}
                onChange={(e) => { setLinkedEpisodeId(e.target.value); setCreateEpisode(false); }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-dark"
              >
                <option value="">Nenhuma</option>
                {activeEpisodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>{ep.title}</option>
                ))}
              </select>
            </div>
          )}

          {!linkedEpisodeId && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createEpisode}
                  onChange={(e) => setCreateEpisode(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-500"
                />
                <span className="text-xs font-semibold text-dark">Criar novo episodio de doenca</span>
              </label>
              {createEpisode && (
                <input
                  type="text"
                  value={episodeTitle}
                  onChange={(e) => setEpisodeTitle(e.target.value)}
                  placeholder="Titulo do episodio (ex: Infeccao de garganta)"
                  className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-dark placeholder:text-gray-400"
                />
              )}
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={selectedCount === 0 || saving}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {saving ? "Salvando..." : `Salvar ${selectedCount} medicamento(s)`}
          </button>
        </>
      )}

      {/* ---- STATE: EDITING ---- */}
      {step === "editing" && (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-dark">Editar medicamentos</h2>
            <button onClick={() => setStep("results")} className="text-xs text-muted hover:text-dark">Voltar</button>
          </div>
          {medications.map((med, i) => (
            <div key={i} className="p-3 border border-gray-200 rounded-xl space-y-2">
              <input
                type="text"
                value={med.name}
                onChange={(e) => setMedications((prev) => prev.map((m, j) => j === i ? { ...m, name: e.target.value } : m))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-dark font-semibold"
                placeholder="Nome do medicamento"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={med.dosage}
                  onChange={(e) => setMedications((prev) => prev.map((m, j) => j === i ? { ...m, dosage: e.target.value } : m))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-dark"
                  placeholder="Dosagem"
                />
                <input
                  type="text"
                  value={med.frequency}
                  onChange={(e) => setMedications((prev) => prev.map((m, j) => j === i ? { ...m, frequency: e.target.value } : m))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-dark"
                  placeholder="Frequencia"
                />
              </div>
              <input
                type="text"
                value={med.duration || ""}
                onChange={(e) => setMedications((prev) => prev.map((m, j) => j === i ? { ...m, duration: e.target.value || null } : m))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-dark"
                placeholder="Duracao (ex: 7 dias)"
              />
            </div>
          ))}
          <button
            onClick={() => setStep("results")}
            className="w-full py-2.5 bg-indigo-500 text-white font-semibold rounded-xl"
          >
            Confirmar edicao
          </button>
        </div>
      )}

      {/* ---- STATE: SAVING ---- */}
      {step === "saving" && (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-indigo-100 flex items-center justify-center animate-pulse">
            <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-dark">Salvando medicamentos...</p>
        </div>
      )}

      {/* ---- STATE: ERROR ---- */}
      {step === "error" && (
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-dark mb-1">Nao foi possivel processar</p>
          <p className="text-xs text-muted mb-4">{error || "Tente com uma foto mais nitida ou preencha manualmente."}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setStep("upload"); setError(null); setPreview(null); }}
              className="flex-1 py-2.5 bg-indigo-500 text-white font-semibold rounded-xl text-sm"
            >
              Tentar novamente
            </button>
            <Link
              href="/saude/medicamentos/novo"
              className="flex-1 py-2.5 border border-gray-200 text-dark font-semibold rounded-xl text-sm text-center"
            >
              Preencher manual
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
