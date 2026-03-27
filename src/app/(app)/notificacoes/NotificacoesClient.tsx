"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { markNotificationRead, markAllNotificationsRead } from "@/actions/notifications";

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

const typeIcons: Record<string, string> = {
  expense_new: "\u{1F4B0}",
  expense_approved: "\u2705",
  expense_rejected: "\u274C",
  swap_request: "\u{1F504}",
  swap_response: "\u{1F504}",
  chat_message: "\u{1F4AC}",
  document_uploaded: "\u{1F4C4}",
  custody_change: "\u{1F4C5}",
  invitation: "\u{1F465}",
  system: "\u2699\uFE0F",
};

const typeLabelKeys: Record<string, string> = {
  expense_new: "notifications.expenseNew",
  expense_approved: "notifications.expenseApproved",
  expense_rejected: "notifications.expenseRejected",
  swap_request: "notifications.swapRequest",
  swap_response: "notifications.swapResponse",
  chat_message: "notifications.chatMessage",
  document_uploaded: "notifications.documentUploaded",
  custody_change: "notifications.custodyChange",
  invitation: "notifications.invitation",
  system: "notifications.system",
};

function getRelativeTime(dateStr: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return t("notifications.justNow");
  if (diffMin < 60) return t("notifications.minutesAgo", { count: diffMin });
  if (diffHours < 24) return t("notifications.hoursAgo", { count: diffHours });
  return t("notifications.daysAgo", { count: diffDays });
}

/**
 * Replace raw email addresses in notification text with just the name part.
 * e.g. "henrique.pedros@hotmail.com aprovou" → "Henrique aprovou"
 */
function sanitizeEmailInText(text: string): string {
  return text.replace(
    /([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    (_, localPart: string) => {
      // Take first part before dots/underscores and capitalize
      const name = localPart.split(/[._-]/)[0];
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
  );
}

export default function NotificacoesClient({ notifications }: { notifications: Notification[] }) {
  const { t } = useI18n();
  const router = useRouter();

  const hasUnread = notifications.some((n) => !n.is_read);

  async function handleClick(notification: Notification) {
    if (!notification.is_read) {
      await markNotificationRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-1 -ml-1 rounded-lg hover:bg-black/5 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-[#2C2C2C]">{t("notifications.title")}</h1>
        </div>
        {hasUnread && (
          <button
            onClick={handleMarkAllRead}
            className="text-sm text-[#D4735A] font-medium hover:underline"
          >
            {t("notifications.markAllRead")}
          </button>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </div>
          <p className="text-[#2C2C2C] font-semibold">{t("notifications.empty")}</p>
          <p className="text-sm text-[#5A6B6A] mt-1">{t("notifications.emptyDescription")}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map((notification) => {
            const icon = typeIcons[notification.type] || "\u{1F514}";
            return (
              <button
                key={notification.id}
                onClick={() => handleClick(notification)}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-xl transition-colors ${
                  notification.is_read
                    ? "bg-white hover:bg-gray-50"
                    : "bg-blue-50 hover:bg-blue-100/70"
                }`}
              >
                <span className="text-xl flex-shrink-0 mt-0.5" role="img" aria-label={t(typeLabelKeys[notification.type] || "notifications.system")}>
                  {icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${notification.is_read ? "text-[#2C2C2C]" : "text-[#2C2C2C] font-semibold"}`}>
                      {sanitizeEmailInText(notification.title)}
                    </p>
                    <span className="text-[11px] text-[#9CA3AF] flex-shrink-0">
                      {getRelativeTime(notification.created_at, t)}
                    </span>
                  </div>
                  {notification.message && (
                    <p className="text-xs text-[#5A6B6A] mt-0.5 line-clamp-2">{sanitizeEmailInText(notification.message)}</p>
                  )}
                </div>
                {!notification.is_read && (
                  <span className="w-2 h-2 rounded-full bg-[#D4735A] flex-shrink-0 mt-2" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
