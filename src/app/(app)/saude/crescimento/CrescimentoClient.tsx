"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { calculatePercentile } from "@/lib/who-growth-data";
import GrowthChart from "./GrowthChart";

interface GrowthRecord {
  id: string;
  measured_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  head_cm: number | null;
  notes: string | null;
}

interface Child {
  id: string;
  full_name: string;
  birth_date: string;
  sex: "M" | "F" | null;
}

interface Props {
  childrenList: Child[];
  selectedChildId: string;
  selectedChild: Child;
  growthRecords: GrowthRecord[];
  isReadonly: boolean;
  success?: string;
  error?: string;
}

export default function CrescimentoClient({
  childrenList,
  selectedChildId,
  selectedChild,
  growthRecords,
  isReadonly,
  success,
  error: errorMsg,
}: Props) {
  const { t } = useI18n();

  const latest = growthRecords[0] || null;

  function monthsBetween(birth: string, date: string): number {
    const b = new Date(birth + "T12:00:00");
    const d = new Date(date + "T12:00:00");
    return Math.max(0, (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth()) + (d.getDate() - b.getDate()) / 30);
  }

  function getLatestPercentile(metric: "weight" | "height"): number | null {
    if (!latest || !selectedChild.sex) return null;
    const value = metric === "weight" ? latest.weight_kg : latest.height_cm;
    if (!value) return null;
    const ageMonths = monthsBetween(selectedChild.birth_date, latest.measured_date);
    return calculatePercentile(ageMonths, value, selectedChild.sex, metric);
  }

  const weightPercentile = getLatestPercentile("weight");
  const heightPercentile = getLatestPercentile("height");

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function formatShortDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  if (!childrenList || childrenList.length === 0) {
    return (
      <div className="max-w-lg mx-auto pb-20">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/saude" className="text-muted hover:text-dark">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-dark">{t("health.growthTitle")}</h1>
        </div>
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-3" aria-hidden="true">📏</p>
          <p className="text-muted text-sm mb-1">{t("health.noChildRegistered")}</p>
          <p className="text-muted text-xs">{t("health.addChildToRegisterMeasurements")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark" aria-label={t("health.backToHealth")}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("health.growthTitle")}</h1>
          <p className="text-sm text-muted">
            {t("health.trackingOf", { name: selectedChild.full_name.split(" ")[0] })}
          </p>
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(success)}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {/* Child Selector */}
      {childrenList.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
          {childrenList.map((child) => {
            const isActive = child.id === selectedChildId;
            return (
              <Link
                key={child.id}
                href={`/saude/crescimento?crianca=${child.id}`}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white border-2 border-primary"
                    : "bg-white text-dark border-2 border-gray-200 hover:border-primary/40"
                }`}
              >
                {child.full_name.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      )}

      {/* Current Stats */}
      {latest ? (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-xs text-muted mb-1">{t("health.weight")}</p>
            <p className="text-xl font-bold text-dark">
              {latest.weight_kg ? `${latest.weight_kg}` : "—"}
            </p>
            {weightPercentile !== null ? (
              <p className={`text-[10px] font-semibold ${
                weightPercentile >= 15 && weightPercentile <= 85 ? "text-emerald-600" :
                weightPercentile >= 3 && weightPercentile <= 97 ? "text-amber-600" : "text-red-600"
              }`}>P{weightPercentile}</p>
            ) : (
              <p className="text-[10px] text-muted">kg</p>
            )}
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-xs text-muted mb-1">{t("health.height")}</p>
            <p className="text-xl font-bold text-dark">
              {latest.height_cm ? `${latest.height_cm}` : "—"}
            </p>
            {heightPercentile !== null ? (
              <p className={`text-[10px] font-semibold ${
                heightPercentile >= 15 && heightPercentile <= 85 ? "text-emerald-600" :
                heightPercentile >= 3 && heightPercentile <= 97 ? "text-amber-600" : "text-red-600"
              }`}>P{heightPercentile}</p>
            ) : (
              <p className="text-[10px] text-muted">cm</p>
            )}
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-xs text-muted mb-1">{t("health.head")}</p>
            <p className="text-xl font-bold text-dark">
              {latest.head_cm ? `${latest.head_cm}` : "—"}
            </p>
            <p className="text-[10px] text-muted">cm</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center mb-6">
          <p className="text-4xl mb-3" aria-hidden="true">📏</p>
          <p className="text-muted text-sm mb-1">{t("health.noMeasurementYet")}</p>
          <p className="text-muted text-xs">{t("health.registerWeightHeightHead")}</p>
        </div>
      )}

      {latest && (
        <p className="text-xs text-muted text-center mb-6">
          {t("health.lastMeasurement")}: {formatDate(latest.measured_date)}
        </p>
      )}

      {/* Growth Chart (WHO curves) */}
      <GrowthChart
        records={growthRecords.map((r) => ({
          id: r.id,
          measured_date: r.measured_date,
          weight_kg: r.weight_kg ? Number(r.weight_kg) : null,
          height_cm: r.height_cm ? Number(r.height_cm) : null,
          head_cm: r.head_cm ? Number(r.head_cm) : null,
          notes: r.notes,
        }))}
        birthDate={selectedChild.birth_date}
        childName={selectedChild.full_name}
        childSex={selectedChild.sex}
      />

      {/* History */}
      {growthRecords.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1">
            {t("health.measurementHistory")}
          </h2>
          <div className="space-y-3">
            {growthRecords.map((record) => (
              <div key={record.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-base">📏</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-dark">
                        {record.weight_kg ? `${record.weight_kg} kg` : ""}
                        {record.weight_kg && record.height_cm ? " — " : ""}
                        {record.height_cm ? `${record.height_cm} cm` : ""}
                      </p>
                      {record.head_cm && (
                        <span className="text-xs text-muted">
                          PC: {record.head_cm} cm
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {formatShortDate(record.measured_date)}
                    </p>
                    {record.notes && (
                      <p className="text-xs text-muted mt-1">{record.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add button */}
      {!isReadonly && (
        <Link
          href="/saude/crescimento/novo"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 px-5 py-3 bg-accent text-white text-sm font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("health.registerMeasurement")}
        </Link>
      )}
    </div>
  );
}
