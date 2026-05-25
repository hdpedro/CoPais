"use client";

/**
 * NotifPrefsClient — formulário pra editar profiles.notification_prefs.
 *
 * Padrão: server actions inline em <form action={fn}>. Sem state React.
 * Toggle = form submit. Time inputs = onBlur submit. Quick mute = botões.
 *
 * Optimistic UI: marca botão ativo durante navigation, revalidatePath
 * server-side faz refetch automático.
 */

import { useTransition } from "react";
import { useI18n } from "@/i18n/provider";
import { quickMute, updatePref } from "@/actions/notification-prefs";
import type { NotificationPrefs, NotificationCategory } from "@/lib/services/notification-prefs";

interface Props {
  initialPrefs: NotificationPrefs;
}

const CATEGORIES: Array<{ key: NotificationCategory; labelKey: string; hintKey: string }> = [
  { key: "activity_reminders", labelKey: "catActivityReminders", hintKey: "catActivityRemindersHint" },
  { key: "activity_digest", labelKey: "catActivityDigest", hintKey: "catActivityDigestHint" },
  { key: "chat", labelKey: "catChat", hintKey: "catChatHint" },
  { key: "vaccine_alerts", labelKey: "catVaccineAlerts", hintKey: "catVaccineAlertsHint" },
  { key: "health_collab", labelKey: "catHealthCollab", hintKey: "catHealthCollabHint" },
  { key: "school_collab", labelKey: "catSchoolCollab", hintKey: "catSchoolCollabHint" },
  { key: "expense_collab", labelKey: "catExpenseCollab", hintKey: "catExpenseCollabHint" },
  { key: "decisions", labelKey: "catDecisions", hintKey: "catDecisionsHint" },
  { key: "swap", labelKey: "catSwap", hintKey: "catSwapHint" },
  { key: "balance_operations", labelKey: "catBalanceOperations", hintKey: "catBalanceOperationsHint" },
  { key: "settlements", labelKey: "catSettlements", hintKey: "catSettlementsHint" },
  { key: "birthday", labelKey: "catBirthday", hintKey: "catBirthdayHint" },
  { key: "retention", labelKey: "catRetention", hintKey: "catRetentionHint" },
];

export default function NotifPrefsClient({ initialPrefs }: Props) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  const isMuted = !!initialPrefs.mute_until && new Date(initialPrefs.mute_until) > new Date();
  const mutedUntilLabel = isMuted
    ? new Date(initialPrefs.mute_until!).toLocaleString(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  async function toggleCategory(category: NotificationCategory, value: boolean) {
    const fd = new FormData();
    fd.set("field", `category:${category}`);
    fd.set("value", value ? "true" : "false");
    startTransition(async () => {
      await updatePref(fd);
    });
  }

  async function toggleQuietHours(enabled: boolean) {
    const fd = new FormData();
    fd.set("field", "quiet_hours_enabled");
    fd.set("value", enabled ? "true" : "false");
    startTransition(async () => {
      await updatePref(fd);
    });
  }

  async function updateQuietHoursTime(which: "start" | "end", value: string) {
    const fd = new FormData();
    fd.set("field", `quiet_hours_${which}`);
    fd.set("value", value);
    startTransition(async () => {
      await updatePref(fd);
    });
  }

  async function applyQuickMute(duration: "1h" | "4h" | "tomorrow" | "clear") {
    const fd = new FormData();
    fd.set("duration", duration);
    startTransition(async () => {
      await quickMute(fd);
    });
  }

  return (
    <div className="space-y-6">
      {/* Section: Mute */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-semibold text-dark mb-1">{t("notifPrefs.sectionMute")}</h2>
        <p className="text-xs text-muted mb-3">{t("notifPrefs.muteHint")}</p>
        {isMuted ? (
          <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900">
              🔕 {t("notifPrefs.mutedUntil", { time: mutedUntilLabel || "" })}
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => applyQuickMute("1h")}
            className="text-sm text-dark bg-white hover:bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 transition-colors disabled:opacity-50"
          >
            {t("notifPrefs.mute1h")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => applyQuickMute("4h")}
            className="text-sm text-dark bg-white hover:bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 transition-colors disabled:opacity-50"
          >
            {t("notifPrefs.mute4h")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => applyQuickMute("tomorrow")}
            className="text-sm text-dark bg-white hover:bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 transition-colors disabled:opacity-50"
          >
            {t("notifPrefs.muteTomorrow")}
          </button>
          <button
            type="button"
            disabled={pending || !isMuted}
            onClick={() => applyQuickMute("clear")}
            className="text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg py-2 px-3 transition-colors disabled:opacity-50"
          >
            {t("notifPrefs.muteClear")}
          </button>
        </div>
      </section>

      {/* Section: Quiet Hours */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-base font-semibold text-dark mb-1">{t("notifPrefs.sectionQuietHours")}</h2>
            <p className="text-xs text-muted">{t("notifPrefs.quietHoursLabel")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={initialPrefs.quiet_hours.enabled}
            onClick={() => toggleQuietHours(!initialPrefs.quiet_hours.enabled)}
            disabled={pending}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
              initialPrefs.quiet_hours.enabled ? "bg-primary" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                initialPrefs.quiet_hours.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {initialPrefs.quiet_hours.enabled ? (
          <>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="block">
                <span className="text-xs text-muted mb-1 block">{t("notifPrefs.quietHoursStart")}</span>
                <input
                  type="time"
                  defaultValue={initialPrefs.quiet_hours.start}
                  onBlur={(e) => updateQuietHoursTime("start", e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">{t("notifPrefs.quietHoursEnd")}</span>
                <input
                  type="time"
                  defaultValue={initialPrefs.quiet_hours.end}
                  onBlur={(e) => updateQuietHoursTime("end", e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                />
              </label>
            </div>
            <p className="text-[11px] text-muted mt-3">{t("notifPrefs.quietHoursHint")}</p>
          </>
        ) : null}
      </section>

      {/* Section: Categories */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-semibold text-dark mb-1">{t("notifPrefs.sectionCategories")}</h2>
        <p className="text-xs text-muted mb-4">{t("notifPrefs.categoriesHint")}</p>
        <div className="divide-y divide-gray-100">
          {CATEGORIES.map((cat) => {
            const enabled = initialPrefs.categories[cat.key] ?? true;
            return (
              <div key={cat.key} className="flex items-start justify-between gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dark">{t(`notifPrefs.${cat.labelKey}`)}</p>
                  <p className="text-[11px] text-muted mt-0.5">{t(`notifPrefs.${cat.hintKey}`)}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => toggleCategory(cat.key, !enabled)}
                  disabled={pending}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    enabled ? "bg-primary" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-muted text-center px-4">{t("notifPrefs.footerHint")}</p>
    </div>
  );
}
