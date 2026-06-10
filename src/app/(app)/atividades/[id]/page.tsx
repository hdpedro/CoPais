import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getBrazilToday, formatDateKey } from "@/lib/calendar-utils";
import { getServerT, getRequestLocale } from "@/i18n/server";
import ActivityDetailClient from "./ActivityDetailClient";

/**
 * Detalhe da atividade (era redirect-only pra /atividades — feedback do dono
 * 10/jun: "não é clicável"). Mostra meta + ocorrências recentes com estado do
 * relato + próximas. Honra os deep-links de push `?date=YYYY-MM-DD&followup=1`
 * (lembrete / "como foi?") abrindo o ActivityReportModal direto na ocorrência
 * certa — o "ideal futuro" documentado no redirect antigo.
 */
export default async function AtividadeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; followup?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId } = activeGroup;

  const { data: activity } = await supabase
    .from("child_activities")
    .select(
      "id, name, category, time_start, time_end, location, child_id, children(full_name), responsible_id, profiles!child_activities_responsible_id_fkey(full_name)",
    )
    .eq("id", id)
    .eq("group_id", groupId)
    .single();
  if (!activity) redirect("/atividades");

  const todayKey = getBrazilToday();
  const todayParts = todayKey.split("-").map(Number);
  const rangeStart = formatDateKey(new Date(todayParts[0], todayParts[1] - 1, todayParts[2] - 7, 12));
  const rangeEnd = formatDateKey(new Date(todayParts[0], todayParts[1] - 1, todayParts[2] + 14, 12));

  const [{ data: occurrences }, { data: reports }] = await Promise.all([
    supabase
      .from("calendar_occurrences")
      .select("occurrence_date")
      .eq("activity_id", id)
      .gte("occurrence_date", rangeStart)
      .lte("occurrence_date", rangeEnd)
      .order("occurrence_date"),
    supabase
      .from("activity_reports")
      .select("occurrence_date, status")
      .eq("activity_id", id)
      .gte("occurrence_date", rangeStart)
      .lte("occurrence_date", todayKey),
  ]);

  const t = await getServerT();
  const locale = await getRequestLocale();
  const intlLocale =
    ({ pt: "pt-BR", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE" } as Record<string, string>)[locale] ?? "pt-BR";
  const dateFmt = new Intl.DateTimeFormat(intlLocale, { weekday: "short", day: "numeric", month: "numeric" });
  const label = (key: string) => dateFmt.format(new Date(key + "T12:00:00"));

  const reportedByDate = new Map((reports || []).map((r) => [r.occurrence_date as string, r.status as string]));
  const past = (occurrences || [])
    .filter((o) => o.occurrence_date <= todayKey)
    .map((o) => ({
      date: o.occurrence_date as string,
      dateLabel: label(o.occurrence_date),
      reported: reportedByDate.has(o.occurrence_date),
    }))
    .reverse();
  const upcoming = (occurrences || [])
    .filter((o) => o.occurrence_date > todayKey)
    .map((o) => ({ date: o.occurrence_date as string, dateLabel: label(o.occurrence_date) }));

  // Deep-link de push: abre o relato da ocorrência certa (se ainda não relatada).
  const wantsDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const initialReportDate = wantsDate && !reportedByDate.has(wantsDate) && wantsDate <= todayKey ? wantsDate : null;

  const childName = (activity.children as unknown as { full_name: string } | null)?.full_name?.split(" ")[0] || "";
  const responsibleName = (activity.profiles as unknown as { full_name: string } | null)?.full_name || null;

  return (
    <ActivityDetailClient
      activity={{
        id: activity.id as string,
        name: activity.name as string,
        category: activity.category as string,
        timeStart: (activity.time_start as string | null)?.slice(0, 5) ?? null,
        location: (activity.location as string | null) ?? null,
        childName,
        responsibleName,
      }}
      past={past}
      upcoming={upcoming}
      initialReportDate={initialReportDate}
      headings={{
        upcoming: t("activityDetail.upcomingHeading"),
        recent: t("activityDetail.recentHeading"),
        reported: t("activityDetail.reportedBadge"),
        noOccurrences: t("activityDetail.noOccurrences"),
        responsible: t("calendar.responsible"),
        reportCta: t("activityReport.reportCta"),
      }}
    />
  );
}
