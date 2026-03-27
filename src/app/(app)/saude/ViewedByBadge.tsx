"use client";

import { getDisplayName } from "@/lib/constants";
import { useI18n } from "@/i18n/provider";

interface ViewedByBadgeProps {
  views: Array<{
    viewed_by: string;
    viewed_at: string;
    profiles: { full_name: string } | null;
  }>;
  currentUserId: string;
}

export default function ViewedByBadge({
  views,
  currentUserId,
}: ViewedByBadgeProps) {
  const { t } = useI18n();

  // Filter out current user's own views
  const otherViews = views.filter((v) => v.viewed_by !== currentUserId);
  if (otherViews.length === 0) return null;

  const mostRecent = otherViews[0]; // already sorted by viewed_at desc
  const name = getDisplayName(mostRecent.profiles?.full_name, true) || t("health.viewedBy.someone");
  const viewedAt = new Date(mostRecent.viewed_at);
  const minutesAgo = Math.floor(
    (Date.now() - viewedAt.getTime()) / (1000 * 60),
  );

  let timeStr: string;
  if (minutesAgo < 1) timeStr = t("health.viewedBy.now");
  else if (minutesAgo < 60) timeStr = t("health.viewedBy.minutesAgo", { count: String(minutesAgo) });
  else if (minutesAgo < 1440) timeStr = t("health.viewedBy.hoursAgo", { count: String(Math.floor(minutesAgo / 60)) });
  else timeStr = t("health.viewedBy.daysAgo", { count: String(Math.floor(minutesAgo / 1440)) });

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
      {t("health.viewedBy.viewedLabel", { name, time: timeStr })}
    </span>
  );
}
