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
    return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
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
      setMessage(data.message || "");
    } catch {
      setMessage(t("brain.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  const activities = preview?.plan.activities ?? [];
  const keptCount = kept.filter(Boolean).length;

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
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
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
        <div role="dialog" aria-label={t("brain.sharing.uploadTitle")} className="space-y-4 rounded border p-4">
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

      {step === "processing" && <p aria-live="polite">{t("brain.processing")}</p>}

      {step === "preview" && preview && (
        <div className="space-y-6">
          {/* Zona 1 — o que encontrei */}
          <section aria-label={t("brain.preview.foundItems")}>
            <h2 className="font-semibold">{t("brain.preview.foundItems")}</h2>
            <p className="text-sm text-gray-600">{t("brain.preview.foundCount", { count: activities.length })}</p>
          </section>

          {/* Zona 2 — o que muda */}
          {preview.impacts.length > 0 && (
            <section aria-label={t("brain.preview.impacts")}>
              <h2 className="font-semibold">{t("brain.preview.impacts")}</h2>
              <ul className="space-y-1">
                {preview.impacts.map((f, i) => (
                  <li key={`${f.kind}-${i}`} role="status" aria-live="polite" className="text-sm text-amber-800">
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
                return (
                  <li key={i} className="flex items-start gap-2 rounded border p-2">
                    <input
                      type="checkbox"
                      checked={kept[i] ?? false}
                      onChange={() => setKept((prev) => prev.map((k, j) => (j === i ? !k : k)))}
                      aria-label={a.name}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{a.name}</div>
                      <div className="text-xs text-gray-600">{fmtDate(a.startDate)}</div>
                      {low && <div className="text-xs text-amber-700">{t("brain.preview.reviewField")}</div>}
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
