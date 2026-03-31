"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

export interface TimelineEvent {
  id: string;
  type: "illness" | "dose" | "appointment" | "symptom" | "vaccine" | "growth";
  title: string;
  subtitle: string | null;
  timestamp: string; // ISO string
  relativeTime: string; // encoded like "__min__5" or "__hours__2"
  href: string;
  icon: string;
  color: string; // tailwind bg class
}

interface HealthTimelineProps {
  events: TimelineEvent[];
  childId: string;
}

export default function HealthTimeline({ events }: HealthTimelineProps) {
  const { t } = useI18n();

  function translateRelativeTime(encoded: string): string {
    if (encoded === "__now__") return t("health.now");
    if (encoded.startsWith("__min__")) {
      const count = encoded.replace("__min__", "");
      return t("health.minutesAgo", { count });
    }
    if (encoded.startsWith("__hours__")) {
      const count = encoded.replace("__hours__", "");
      return t("health.hoursAgo", { count });
    }
    if (encoded.startsWith("__days__")) {
      const count = encoded.replace("__days__", "");
      return t("health.daysAgo", { count });
    }
    return encoded;
  }

  if (events.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">
        {t("health.recentActivity")}
      </h2>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {events.map((event, i) => (
          <Link
            key={`${event.type}-${event.id}`}
            href={event.href}
            className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${i > 0 ? "border-t border-gray-100" : ""}`}
          >
            <div className={`w-8 h-8 rounded-lg ${event.color} flex items-center justify-center flex-shrink-0`}>
              <span className="text-sm">{event.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-dark truncate">{event.title}</p>
              {event.subtitle && (
                <p className="text-[11px] text-muted truncate">{event.subtitle}</p>
              )}
            </div>
            <span className="text-[10px] text-muted flex-shrink-0 whitespace-nowrap">
              {translateRelativeTime(event.relativeTime)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
