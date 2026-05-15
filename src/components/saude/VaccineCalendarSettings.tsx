"use client";

/**
 * VaccineCalendarSettings — escolha do calendário (PNI/SBIm/both) por criança.
 *
 * UI inline, sem modal. Render como segmento de 3 pílulas. Mudança chama
 * server action e recompute roda via trigger.
 */

import { useI18n } from "@/i18n/provider";
import { updateCalendarPreference } from "@/actions/vaccines";
import type { CalendarPreference } from "@/lib/services/vaccines";

interface Props {
  childId: string;
  current: CalendarPreference;
  isReadonly: boolean;
}

export default function VaccineCalendarSettings({ childId, current, isReadonly }: Props) {
  const { t } = useI18n();
  if (isReadonly) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
          {t("health.vaccineEngine.settingsTitle")}
        </p>
        <p className="text-sm text-dark">
          {current === "public"
            ? t("health.vaccineEngine.settingsPublic")
            : current === "private"
            ? t("health.vaccineEngine.settingsPrivate")
            : t("health.vaccineEngine.settingsBoth")}
        </p>
      </div>
    );
  }

  const opts: Array<{ key: CalendarPreference; label: string; hint: string }> = [
    {
      key: "both",
      label: t("health.vaccineEngine.settingsBoth"),
      hint: t("health.vaccineEngine.settingsBothHint"),
    },
    {
      key: "public",
      label: t("health.vaccineEngine.settingsPublic"),
      hint: t("health.vaccineEngine.settingsPublicHint"),
    },
    {
      key: "private",
      label: t("health.vaccineEngine.settingsPrivate"),
      hint: t("health.vaccineEngine.settingsPrivateHint"),
    },
  ];

  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
        {t("health.vaccineEngine.settingsTitle")}
      </p>
      <div className="space-y-2">
        {opts.map((o) => {
          const active = o.key === current;
          return (
            <form key={o.key} action={updateCalendarPreference}>
              <input type="hidden" name="childId" value={childId} />
              <input type="hidden" name="preference" value={o.key} />
              <button
                type="submit"
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  active
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 hover:border-primary/40 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                      active ? "border-primary bg-primary" : "border-gray-300"
                    }`}
                  />
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${active ? "text-primary" : "text-dark"}`}>{o.label}</p>
                    <p className="text-[11px] text-muted mt-0.5">{o.hint}</p>
                  </div>
                </div>
              </button>
            </form>
          );
        })}
      </div>
      <p className="text-[11px] text-muted mt-3">{t("health.vaccineEngine.settingsHpvNote")}</p>
    </div>
  );
}
