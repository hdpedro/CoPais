"use client";

import { useI18n } from "@/i18n/provider";
import { createSchoolLog } from "@/actions/school";
import { getDisplayName } from "@/lib/constants";

interface Child {
  id: string;
  full_name: string;
}

interface SchoolLog {
  id: string;
  title: string;
  description: string | null;
  log_type: string;
  log_date: string;
  children: { full_name?: string } | null;
  profiles: { full_name?: string } | null;
}

interface EscolaClientProps {
  groupId: string;
  isReadonly: boolean;
  children: Child[];
  logs: SchoolLog[];
  today: string;
}

export default function EscolaClient({ groupId, isReadonly, children, logs, today }: EscolaClientProps) {
  const { t } = useI18n();

  const typeLabels: Record<string, string> = {
    grade: t("schoolPage.typeGrade"),
    meeting: t("schoolPage.typeMeeting"),
    behavior: t("schoolPage.typeBehavior"),
    homework: t("schoolPage.typeHomework"),
    event: t("schoolPage.typeEvent"),
    absence: t("schoolPage.typeAbsence"),
    achievement: t("schoolPage.typeAchievement"),
    concern: t("schoolPage.typeConcern"),
    other: t("schoolPage.typeOther"),
  };

  const typeIcons: Record<string, string> = {
    grade: "📊",
    meeting: "👥",
    behavior: "📝",
    homework: "📚",
    event: "🎉",
    absence: "🚫",
    achievement: "🏆",
    concern: "⚠️",
    other: "📌",
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-dark">{t("nav.school")}</h1>
        <p className="text-sm text-muted mt-1">
          {t("schoolPage.subtitle")}
        </p>
      </div>

      {/* New School Log Form */}
      {!isReadonly && (!children || children.length === 0) && (
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-muted text-sm">{t("schoolPage.registerChildFirst")}</p>
          <a href="/criancas/nova" className="text-primary font-medium text-sm mt-2 inline-block">{t("family.addChild")}</a>
        </div>
      )}
      {!isReadonly && children && children.length > 0 && (
      <form action={createSchoolLog} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-dark">{t("schoolPage.newLog")}</h3>
        <input type="hidden" name="groupId" value={groupId} />

        <div className="grid grid-cols-2 gap-3">
          <select name="childId" required
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">{t("schoolPage.childPlaceholder")}</option>
            {children?.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
          <select name="logType" required
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">{t("schoolPage.typePlaceholder")}</option>
            {Object.entries(typeLabels).map(([k, v]) => (
              <option key={k} value={k}>{typeIcons[k]} {v}</option>
            ))}
          </select>
        </div>

        <input type="text" name="title" required placeholder={t("schoolPage.titlePlaceholder")}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <textarea name="description" rows={2} placeholder={t("schoolPage.detailsPlaceholder")}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <input type="date" name="logDate" defaultValue={today}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <button type="submit"
          className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          {t("schoolPage.register")}
        </button>
      </form>
      )}

      {/* School Logs */}
      {logs && logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{typeIcons[log.log_type] || "📌"}</span>
                  <div>
                    <h4 className="font-medium text-dark text-sm">{log.title}</h4>
                    <p className="text-xs text-muted">
                      {typeLabels[log.log_type]}{log.children?.full_name ? ` - ${log.children.full_name}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted">{new Date(log.log_date).toLocaleDateString("pt-BR")}</span>
              </div>
              {log.description && <p className="text-sm text-muted mt-2 ml-8">{log.description}</p>}
              <p className="text-xs text-muted mt-1 ml-8">{t("schoolPage.by")} {getDisplayName(log.profiles?.full_name) || t("schoolPage.unknown")}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">{t("schoolPage.noLogs")}</p>
          <p className="text-sm text-muted mt-1">{t("schoolPage.noLogsHint")}</p>
        </div>
      )}
    </div>
  );
}
