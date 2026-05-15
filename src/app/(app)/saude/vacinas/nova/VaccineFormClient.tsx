"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import SubmitButton from "../../SubmitButton";

interface CatalogItem {
  id: string;
  code: string;
  name: string;
  aliases: string[];
}

interface DuplicatePrefill {
  vaccineName: string;
  catalogId: string | null;
  doseLabel: string | null;
  doseNumber: number | null;
  administeredDate: string;
  batchNumber: string | null;
  location: string | null;
  notes: string | null;
}

interface Props {
  groupId: string;
  children: { id: string; full_name: string }[];
  catalog: CatalogItem[];
  today: string;
  error?: string;
  initialChildId?: string;
  duplicate?: DuplicatePrefill | null;
  createAction: (formData: FormData) => Promise<void>;
}

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export default function VaccineFormClient({
  groupId,
  children,
  catalog,
  today,
  error: errorMsg,
  initialChildId,
  duplicate,
  createAction,
}: Props) {
  const { t } = useI18n();
  const initialPickedId = duplicate?.catalogId || null;
  const initialQuery = duplicate?.vaccineName || "";
  const [query, setQuery] = useState(initialQuery);
  const [pickedId, setPickedId] = useState<string | null>(initialPickedId);

  const filteredCatalog = useMemo(() => {
    const q = normalizeStr(query);
    if (!q) return catalog.slice(0, 8);
    return catalog
      .filter((c) => {
        const inName = normalizeStr(c.name).includes(q);
        const inAlias = c.aliases.some((a) => normalizeStr(a).includes(q));
        return inName || inAlias;
      })
      .slice(0, 8);
  }, [query, catalog]);

  const picked = pickedId ? catalog.find((c) => c.id === pickedId) || null : null;

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude/vacinas" className="text-muted hover:text-dark" aria-label={t("health.backToHealth")}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("health.vaccineEngine.registerTitle")}</h1>
          <p className="text-sm text-muted">{t("health.vaccineEngine.registerCta")}</p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {duplicate && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
          <p className="text-sm font-semibold text-amber-900">
            {t("health.vaccineEngine.duplicateModalTitle")}
          </p>
          <p className="text-xs text-amber-800 mt-1">
            {t("health.vaccineEngine.duplicateModalBody", {
              vaccineName: duplicate.vaccineName,
              doseNumber: String(duplicate.doseNumber ?? "?"),
            })}
          </p>
          <p className="text-[11px] text-amber-700 mt-2">
            Os campos foram pré-preenchidos. Se for de fato outra dose, clique em <strong>Registrar mesmo assim</strong> abaixo.
          </p>
        </div>
      )}

      <form action={createAction} className="space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="catalogId" value={picked?.id || pickedId || ""} />
        {duplicate ? <input type="hidden" name="forceDuplicate" value="1" /> : null}
        {duplicate?.doseNumber ? <input type="hidden" name="doseNumber" value={String(duplicate.doseNumber)} /> : null}

        {/* Criança */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <label htmlFor="childId" className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.child")} *
          </label>
          {children.length > 0 ? (
            <select
              id="childId"
              name="childId"
              required
              defaultValue={initialChildId}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">{t("health.select")}</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              {t("health.registerChildFirst")}{" "}
              <Link href="/criancas/nova" className="text-primary font-semibold underline">
                {t("health.registerChild")}
              </Link>
            </div>
          )}
        </div>

        {/* Vacina (autocomplete contra catálogo) */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <label htmlFor="vaccineName" className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.vaccineEngine.registerFieldName")} *
          </label>
          <input
            id="vaccineName"
            type="text"
            name="vaccineName"
            required
            value={picked ? picked.name : query}
            onChange={(e) => {
              setPickedId(null);
              setQuery(e.target.value);
            }}
            autoComplete="off"
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {!picked && query.length >= 1 && filteredCatalog.length > 0 ? (
            <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
              {filteredCatalog.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPickedId(c.id);
                      setQuery(c.name);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-primary/5 transition-colors"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Dose */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <label htmlFor="doseLabel" className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.vaccineEngine.registerFieldDose")}{" "}
            <span className="font-normal text-muted">({t("common.optional")})</span>
          </label>
          <input
            id="doseLabel"
            type="text"
            name="doseLabel"
            defaultValue={duplicate?.doseLabel || undefined}
            placeholder="Ex: 1ª dose, reforço"
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <p className="text-[11px] text-muted mt-1">{t("health.vaccineEngine.registerFieldDoseHint")}</p>
        </div>

        {/* Data */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <label htmlFor="administeredDate" className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.vaccineEngine.registerFieldDate")} *
          </label>
          <input
            id="administeredDate"
            type="date"
            name="administeredDate"
            required
            defaultValue={duplicate?.administeredDate || today}
            max={today}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Lote */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <label htmlFor="batchNumber" className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.vaccineEngine.registerFieldBatch")}{" "}
            <span className="font-normal text-muted">({t("common.optional")})</span>
          </label>
          <input
            id="batchNumber"
            type="text"
            name="batchNumber"
            defaultValue={duplicate?.batchNumber || undefined}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Local */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <label htmlFor="location" className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.vaccineEngine.registerFieldLocation")}{" "}
            <span className="font-normal text-muted">({t("common.optional")})</span>
          </label>
          <input
            id="location"
            type="text"
            name="location"
            defaultValue={duplicate?.location || undefined}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Notas */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <label htmlFor="notes" className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.vaccineEngine.registerFieldNotes")}{" "}
            <span className="font-normal text-muted">({t("common.optional")})</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={duplicate?.notes || undefined}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
          />
        </div>

        <SubmitButton
          label={duplicate ? t("health.vaccineEngine.duplicateModalConfirm") : t("health.vaccineEngine.registerSave")}
        />
      </form>
    </div>
  );
}
