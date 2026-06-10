import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getPendingReports } from "@/actions/activities";
import { getServerT, getRequestLocale } from "@/i18n/server";
import PendingReportsList from "./PendingReportsList";

/**
 * Relatos pendentes — ocorrências passadas [hoje-7, hoje] sem activity_report.
 * Destino do "Relatar" da Sua Atenção (paridade com o native /atividades/pendentes).
 * Relatar pela occurrence_date CERTA limpa o pendente; relatar pra "hoje" não.
 */
export default async function PendentesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId } = activeGroup;

  const t = await getServerT();
  const locale = await getRequestLocale();
  const intlLocale =
    ({ pt: "pt-BR", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE" } as Record<string, string>)[locale] ?? "pt-BR";
  const dateFmt = new Intl.DateTimeFormat(intlLocale, { weekday: "short", day: "numeric", month: "numeric" });

  const pending = await getPendingReports(groupId, user.id);
  const items = pending.map((p) => ({
    ...p,
    dateLabel: dateFmt.format(new Date(p.occurrenceDate + "T12:00:00")),
  }));

  return (
    <div className="pb-20">
      <header className="mb-5">
        <h1 className="font-display text-[27px] font-semibold text-[#2A2622] tracking-tight leading-[1.1]">
          {t("activityReport.pendingTitle")}
        </h1>
        <p className="mt-0.5 text-[12.5px] text-[#9A8878]">{t("activityReport.pendingSubtitle")}</p>
      </header>
      <PendingReportsList items={items} />
    </div>
  );
}
