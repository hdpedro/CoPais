"use client";

/* ------------------------------------------------------------------ */
/* BrainCalendarClient — upload + preview 3 zonas (Kindar Brain A0)     */
/*                                                                      */
/* ⚠️ PRECISA DE VERIFICAÇÃO VISUAL: escrito sem dev-server (worktree    */
/* sem .env). tsc/lint/i18n verdes; layout/UX a ajustar rodando.        */
/*                                                                      */
/* Fluxo: upload → CONSENTIMENTO (aviso de compartilhamento) → análise  */
/* → preview (1.o que encontrei · 2.o que muda · 3.o que vou criar,     */
/* com deseleção por item) → confirma → feito (com Desfazer).           */
/* Confirma materializa só os itens MANTIDOS (keepIndices).             */
/* ------------------------------------------------------------------ */

import { useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import type { BrainChild, ImpactFinding, IntakePreview } from "@/lib/ai/brain/types";

interface Props {
  groupChildren: BrainChild[];
}

type Step = "upload" | "consent" | "processing" | "preview" | "done" | "error";

interface ApiResult {
  kind: string;
  preview?: IntakePreview;
  message?: string;
  options?: BrainChild[];
  removed?: number;
  detached?: number;
}

export default function BrainCalendarClient({ groupChildren }: Props) {
  const { t, locale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [childId, setChildId] = useState<string | null>(groupChildren.length === 1 ? groupChildren[0].id : null);
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [kept, setKept] = useState<boolean[]>([]);
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const childName = (id: string | null): string =>
    groupChildren.find((c) => c.id === id)?.name ?? "";

  const fmtDate = (iso?: string): string => {
    if (!iso) return "";
    const d = new Date(`${iso}T12:00:00`);
    // dia-da-semana torna o aviso "dias seguidos" acionável (seg, ter…).
    return d.toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit" });
  };

  const impactText = (f: ImpactFinding): string => {
    const v = (f.titleVars ?? {}) as Record<string, unknown>;
    return t(f.titleKey, {
      child: childName((v.childId as string) ?? f.childId),
      count: v.count as number,
      date: fmtDate(v.date as string),
      date1: fmtDate(v.date1 as string),
      date2: fmtDate(v.date2 as string),
    });
  };

  async function doUpload() {
    if (!file) return;
    setBusy(true);
    setStep("processing");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("acknowledged", "true");
      if (childId) fd.append("child_id", childId);
      const res = await fetch("/api/brain/intakes", { method: "POST", body: fd });
      const data = (await res.json()) as ApiResult;
      if (data.kind === "preview" && data.preview) {
        setPreview(data.preview);
        setKept((data.preview.plan.activities ?? []).map(() => true));
        setStep("preview");
      } else if (data.kind === "needs_child_selection") {
        setMessage(t("brain.preview.selectChild"));
        setStep("upload"); // volta pra escolher a criança
      } else if (data.kind === "unknown_document") {
        setMessage(t("brain.unknownDocument"));
        setStep("error");
      } else {
        setMessage(data.message || t("brain.error.generic"));
        setStep("error");
      }
    } catch {
      setMessage(t("brain.error.generic"));
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!preview) return;
    setBusy(true);
    try {
      const keepIndices = kept.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
      const res = await fetch(`/api/brain/intakes/${preview.intakeId}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planHash: preview.planHash,
          confirmationToken: preview.confirmationToken,
          keepIndices,
        }),
      });
      const data = (await res.json()) as ApiResult;
      if (data.kind === "executed") {
        setMessage(t("brain.confirm.savedNotice"));
        setStep("done");
      } else if (data.kind === "stale_plan") {
        setMessage(t("brain.stalePlan"));
        setStep("error");
      } else if (data.kind === "already_processing") {
        setMessage(t("brain.alreadyProcessing"));
        setStep("error");
      } else {
        setMessage(data.message || t("brain.error.generic"));
        setStep("error");
      }
    } catch {
      setMessage(t("brain.error.generic"));
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  async function doUndo() {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/brain/intakes/${preview.intakeId}`, { method: "DELETE" });
      const data = (await res.json()) as ApiResult;
      // Reseta pro início (não trava no 'done') + mostra o que foi desfeito.
      setPreview(null);
      setKept([]);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setMessage(data.message || "");
      setStep("upload");
    } catch {
      setMessage(t("brain.error.generic"));
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  const activities = preview?.plan.activities ?? [];
  const keptCount = kept.filter(Boolean).length;

  // Resumo "de DD a DD" pra Zona 1 (visão geral escaneável, não a lista da Zona 3).
  const activityDates = activities.map((a) => a.startDate).filter(Boolean).sort();
  const dateRangeText =
    activityDates.length === 0
      ? ""
      : activityDates[0] === activityDates[activityDates.length - 1]
        ? fmtDate(activityDates[0])
        : t("brain.preview.dateRange", {
            start: fmtDate(activityDates[0]),
            end: fmtDate(activityDates[activityDates.length - 1]),
          });

  return (
    <section aria-label={t("brain.upload.title")} className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-semibold mb-4">{t("brain.upload.title")}</h1>

      {step === "upload" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t("brain.upload.hint")}</p>
          {groupChildren.length > 1 && (
            <label className="block text-sm">
              {t("brain.preview.selectChild")}
              <select
                className="mt-1 block w-full rounded border p-2"
                value={childId ?? ""}
                onChange={(e) => setChildId(e.target.value || null)}
              >
                <option value="">—</option>
                {groupChildren.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          <div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
                {t("brain.upload.takePhoto")}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="inline-flex cursor-pointer items-center rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
                {t("brain.upload.chooseGallery")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {file && <p className="mt-1 text-xs text-gray-600">{file.name}</p>}
          </div>
          <button
            type="button"
            disabled={!file}
            onClick={() => setStep("consent")}
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {t("brain.upload.cta")}
          </button>
          {message && <p className="text-sm text-amber-700">{message}</p>}
        </div>
      )}

      {step === "consent" && (
        <div role="dialog" aria-modal="true" aria-label={t("brain.sharing.uploadTitle")} className="space-y-4 rounded border p-4">
          <h2 className="font-semibold">{t("brain.sharing.uploadTitle")}</h2>
          <p className="text-sm text-gray-700">{t("brain.sharing.uploadWarning")}</p>
          <div className="flex gap-2">
            <button type="button" onClick={doUpload} disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
              {t("brain.sharing.acknowledge")}
            </button>
            <button type="button" onClick={() => setStep("upload")} className="rounded border px-4 py-2">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {step === "processing" && (
        <div className="flex items-center gap-3" aria-live="polite">
          <span
            className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium">{t("brain.processing")}</p>
            <p className="text-xs text-gray-500">{t("brain.processingHint")}</p>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="space-y-6">
          {/* Zona 1 — o que encontrei */}
          <section aria-label={t("brain.preview.foundItems")}>
            <h2 className="font-semibold">{t("brain.preview.foundItems")}</h2>
            <p className="text-sm text-gray-600">{t("brain.preview.foundCount", { count: activities.length })}</p>
            {childId && (
              <p className="text-sm text-gray-700">{t("brain.preview.forChild", { child: childName(childId) })}</p>
            )}
            {dateRangeText && <p className="text-sm text-gray-600">{dateRangeText}</p>}
          </section>

          {/* Zona 2 — o que muda */}
          {preview.impacts.length > 0 && (
            <section aria-label={t("brain.preview.impacts")}>
              <h2 className="font-semibold">{t("brain.preview.impacts")}</h2>
              <ul className="space-y-1">
                {preview.impacts.map((f, i) => (
                  <li
                    key={`${f.kind}-${i}`}
                    className={`text-sm ${f.severity === "attention" ? "text-amber-800" : "text-gray-600"}`}
                  >
                    {impactText(f)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Zona 3 — o que vou criar (deseleção por item) */}
          <section aria-label={t("brain.preview.willCreate")}>
            <h2 className="font-semibold">{t("brain.preview.willCreate")}</h2>
            <ul className="space-y-2">
              {activities.map((a, i) => {
                const low = (a.lowConfidenceFields?.length ?? 0) > 0;
                // 280 cabe o conteúdo + "Onde estudar:" num calendário típico
                // sem cortar a fonte de estudo; doc patológico ainda é truncado.
                const notes = a.notes ? (a.notes.length > 280 ? a.notes.slice(0, 279) + "…" : a.notes) : "";
                return (
                  <li key={i} className="flex items-start gap-2 rounded border p-2">
                    <input
                      type="checkbox"
                      checked={kept[i] ?? false}
                      onChange={() => setKept((prev) => prev.map((k, j) => (j === i ? !k : k)))}
                      aria-label={`${a.name}, ${fmtDate(a.startDate)}`}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{a.name}</div>
                      <div className="text-xs text-gray-600">
                        {fmtDate(a.startDate)}
                        {a.timeStart ? ` · ${a.timeStart}` : ""}
                      </div>
                      {notes && <div className="mt-1 text-xs text-gray-700">{notes}</div>}
                      {a.checklist && a.checklist.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {a.checklist.map((c, k) => (
                            <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      {low && <div className="mt-1 text-xs text-amber-700">{t("brain.preview.reviewField")}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <button
            type="button"
            onClick={doConfirm}
            disabled={busy || keptCount === 0}
            className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {t("brain.preview.confirm")}
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4">
          <p className="text-green-800">{message || t("brain.confirm.savedNotice")}</p>
          <button type="button" onClick={doUndo} disabled={busy} className="rounded border px-4 py-2">
            {t("brain.result.undo")}
          </button>
        </div>
      )}

      {step === "error" && (
        <div className="space-y-4">
          <p className="text-amber-800">{message || t("brain.error.generic")}</p>
          <button type="button" onClick={() => { setStep("upload"); setMessage(""); }} className="rounded border px-4 py-2">
            {t("common.back")}
          </button>
        </div>
      )}
    </section>
  );
}
