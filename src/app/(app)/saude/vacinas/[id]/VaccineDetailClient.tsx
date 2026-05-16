"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";

interface RecordData {
  id: string;
  child_id: string;
  vaccine_name: string;
  dose_label: string | null;
  dose_number: number | null;
  administered_date: string;
  batch_number: string | null;
  location: string | null;
  notes: string | null;
  source: string;
  catalog_id: string | null;
  created_at: string;
  author_name: string | null;
}

interface Props {
  record: RecordData;
  childName: string;
  catalogName: string | null;
  isReadonly: boolean;
  successMessage: string | null;
  errorMessage: string | null;
  editAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}

function formatBrDate(iso: string): string {
  return iso.split("-").reverse().join("/");
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dia${days === 1 ? "" : "s"}`;
  if (days < 365) return `há ${Math.floor(days / 30)} mes${Math.floor(days / 30) === 1 ? "" : "es"}`;
  return `há ${Math.floor(days / 365)} ano${Math.floor(days / 365) === 1 ? "" : "s"}`;
}

export default function VaccineDetailClient({
  record,
  childName,
  catalogName,
  isReadonly,
  successMessage,
  errorMessage,
  editAction,
  deleteAction,
}: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ageBucketHint = catalogName ? `Reconhecida no catálogo: ${catalogName}` : null;

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href={`/saude/vacinas?crianca=${record.child_id}`}
          className="text-muted hover:text-dark"
          aria-label={t("health.backToHealth")}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-dark">{t("health.vaccineDetail.pageTitle")}</h1>
          <p className="text-[10px] text-muted">{childName}</p>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg p-3 mb-4 text-sm">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Hero card */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/40 border border-emerald-200 p-5 mb-4 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/80 flex items-center justify-center text-3xl flex-shrink-0">
            💉
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-emerald-700/70">
              Vacina aplicada
            </p>
            <p className="text-xl font-bold text-emerald-900 mt-0.5 leading-snug">
              {record.vaccine_name}
            </p>
            {record.dose_label ? (
              <p className="text-sm text-emerald-800 mt-1">{record.dose_label}</p>
            ) : null}
            <p className="text-xs text-emerald-700/80 mt-2">
              Tomada em <strong>{formatBrDate(record.administered_date)}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Field rows */}
      {!editing ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 mb-4">
          {record.batch_number && (
            <Row label="Lote" value={record.batch_number} />
          )}
          {record.location && (
            <Row label="Local" value={record.location} />
          )}
          {record.dose_number && (
            <Row label={t("health.vaccineDetail.doseNumberLabel")} value={String(record.dose_number)} />
          )}
          {ageBucketHint && (
            <Row label={t("health.vaccineDetail.catalogLabel")} value={ageBucketHint} muted />
          )}
          {record.notes && (
            <Row label={t("health.vaccineDetail.notesLabel")} value={record.notes} />
          )}
          <Row
            label="Registrado"
            value={`${record.author_name ? `por ${record.author_name} ` : ""}${formatRelative(record.created_at)}`}
            muted
          />
          <Row label="Origem" value={record.source === "ocr" ? "Importado da carteirinha" : "Cadastro manual"} muted />
        </div>
      ) : (
        <form action={editAction} className="space-y-3 mb-4">
          <input type="hidden" name="recordId" value={record.id} />

          <FieldCard label={t("health.vaccineDetail.vaccineNameLabel")} required>
            <input
              type="text"
              name="vaccineName"
              required
              defaultValue={record.vaccine_name}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </FieldCard>

          <FieldCard label="Dose">
            <input
              type="text"
              name="doseLabel"
              defaultValue={record.dose_label || ""}
              placeholder={t("health.vaccineDetail.dosePlaceholder")}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </FieldCard>

          <FieldCard label="Data" required>
            <input
              type="date"
              name="administeredDate"
              required
              defaultValue={record.administered_date}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </FieldCard>

          <FieldCard label="Lote">
            <input
              type="text"
              name="batchNumber"
              defaultValue={record.batch_number || ""}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </FieldCard>

          <FieldCard label="Local">
            <input
              type="text"
              name="location"
              defaultValue={record.location || ""}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </FieldCard>

          <FieldCard label={t("health.vaccineDetail.notesLabel")}>
            <textarea
              name="notes"
              rows={3}
              defaultValue={record.notes || ""}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </FieldCard>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 py-3 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90"
            >
              {t("health.vaccineDetail.saveChanges")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 py-3 rounded-lg bg-gray-100 text-muted text-sm font-medium hover:bg-gray-200"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Actions */}
      {!isReadonly && !editing && (
        <div className="space-y-2 mb-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar registro
          </button>

          {!confirmingDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
              </svg>
              Excluir registro
            </button>
          ) : (
            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
              <p className="text-sm font-semibold text-red-900">Excluir esta dose?</p>
              <p className="text-xs text-red-700 mt-1">
                {t("health.vaccineDetail.deletePromptIntro")}
                {' '}<em>{t("health.vaccineDetail.deletePromptAvailable")}</em>{' '}
                {t("health.vaccineDetail.deletePromptInCalendar")}
              </p>
              <div className="flex gap-2 mt-3">
                <form action={deleteAction} className="flex-1">
                  <input type="hidden" name="recordId" value={record.id} />
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                  >
                    {t("health.vaccineDetail.deleteConfirm")}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 py-2.5 rounded-lg bg-white border border-gray-200 text-muted text-sm font-medium hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Voltar */}
      <Link
        href={`/saude/vacinas?crianca=${record.child_id}`}
        className="block text-center text-xs text-muted py-3"
      >
        ← Voltar pra carteirinha
      </Link>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted">{label}</p>
      <p className={`text-sm mt-0.5 ${muted ? "text-muted" : "text-dark"}`}>{value}</p>
    </div>
  );
}

function FieldCard({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <label className="block text-xs font-semibold text-dark mb-1.5">
        {label} {required ? "*" : null}
      </label>
      {children}
    </div>
  );
}
