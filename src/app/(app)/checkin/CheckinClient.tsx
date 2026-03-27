"use client";

import { useI18n } from "@/i18n/provider";
import Link from "next/link";
import CheckinForm from "./CheckinForm";
import { CHECKIN_CATEGORIES, getDisplayName } from "@/lib/constants";

interface CheckinEntry {
  id: string;
  title: string;
  description: string | null;
  category: string;
  created_at: string;
  checkin_date: string;
  profiles: { full_name: string } | null;
  children: { full_name: string } | null;
}

interface CheckinClientProps {
  groupId: string;
  isReadonly: boolean;
  children: { id: string; full_name: string }[];
  todayCheckins: CheckinEntry[];
  recentCheckins: CheckinEntry[];
  today: string;
}

export default function CheckinClient({
  groupId,
  isReadonly,
  children,
  todayCheckins,
  recentCheckins,
  today,
}: CheckinClientProps) {
  const { t } = useI18n();

  const getCategoryIcon = (cat: string) => {
    const found = CHECKIN_CATEGORIES.find((c) => c.value === cat);
    return found?.icon || "\u{1F4DD}";
  };

  const getCategoryLabel = (cat: string) => {
    const found = CHECKIN_CATEGORIES.find((c) => c.value === cat);
    return found?.label || cat;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("checkin.title")}</h1>
          <p className="text-dark/60 text-sm">
            {new Date(today + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Link href="/dashboard" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Link>
      </div>

      {/* Quick add form */}
      {!isReadonly && (
        <CheckinForm
          groupId={groupId}
          children={children}
        />
      )}

      {/* Today's checkins */}
      {todayCheckins && todayCheckins.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-dark mb-3">{t("checkin.today")}</h3>
          <div className="space-y-2">
            {todayCheckins.map((c) => (
              <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getCategoryIcon(c.category)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-dark text-sm">{c.title}</p>
                      <span className="text-xs text-dark/60">
                        {new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-xs text-dark/70 mt-1">{c.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {getCategoryLabel(c.category)}
                      </span>
                      <span className="text-xs text-dark/60">
                        {t("checkin.by")} {getDisplayName((c.profiles as any)?.full_name)}
                        {(c.children as any)?.full_name ? ` \u2022 ${(c.children as any).full_name}` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent checkins */}
      {recentCheckins && recentCheckins.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-dark mb-3">{t("checkin.recentDays")}</h3>
          <div className="space-y-2">
            {recentCheckins.map((c) => (
              <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm opacity-80">
                <div className="flex items-start gap-3">
                  <span className="text-xl">{getCategoryIcon(c.category)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-dark text-sm">{c.title}</p>
                      <span className="text-xs text-dark/60">
                        {new Date(c.checkin_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-xs text-dark/70 mt-1">{c.description}</p>
                    )}
                    <span className="text-xs text-dark/60">
                      {t("checkin.by")} {getDisplayName((c.profiles as any)?.full_name)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
