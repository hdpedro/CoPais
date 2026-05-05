"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NotificationBadge({ userId }: { userId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();

    // Initial fetch
    async function fetchCount() {
      const { count: unreadCount } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false)
        .neq("title", "push_sub")
        .neq("type", "system");

      setCount(unreadCount || 0);
    }

    fetchCount();

    // Realtime subscription for new notifications.
    // Channel name includes a per-mount instance suffix so two badges (or a
    // fast remount before removeChannel settles) never collide on the same
    // channel — supabase-js throws `cannot add postgres_changes callbacks ...
    // after subscribe()` in that case. Mirrors the native fix in
    // kindar-native/src/services/notifications.ts.
    const instanceId = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`notifications-badge:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Re-fetch count to exclude system/push_sub notifications
          fetchCount();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Re-fetch on update (e.g., mark as read)
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (count === 0) return null;

  return (
    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1">
      {count > 9 ? "9+" : count}
    </span>
  );
}
