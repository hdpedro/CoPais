"use client";

import { useRef, useEffect, useCallback } from "react";
import { hapticLight } from "@/lib/haptics";

interface Channel {
  id: string;
  slug: string;
  name: string;
  channel_type: string;
  icon: string | null;
  sort_order: number;
}

export default function ChannelTabs({
  channels,
  activeSlug,
  unreadCounts,
  onChannelChange,
}: {
  channels: Channel[];
  activeSlug: string;
  unreadCounts: Record<string, number>;
  onChannelChange: (slug: string) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const activeEl = activeRef.current;
      const scrollLeft = activeEl.offsetLeft - container.offsetWidth / 2 + activeEl.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: "smooth" });
    }
  }, [activeSlug]);

  const handleClick = useCallback(
    (slug: string) => {
      if (slug !== activeSlug) {
        hapticLight();
        onChannelChange(slug);
      }
    },
    [activeSlug, onChannelChange]
  );

  return (
    <div
      ref={containerRef}
      className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1 scrollbar-hide"
    >
      {channels.map((ch) => {
        const isActive = ch.slug === activeSlug;
        const unread = unreadCounts[ch.slug] || 0;

        return (
          <button
            key={ch.id}
            ref={isActive ? activeRef : undefined}
            type="button"
            onClick={() => handleClick(ch.slug)}
            className={`flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
              isActive
                ? "bg-primary text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {ch.channel_type === "child" ? (
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isActive ? "bg-white/30 text-white" : "bg-primary/15 text-primary"
              }`}>
                {ch.name.charAt(0).toUpperCase()}
              </span>
            ) : ch.icon ? (
              <span className="text-sm">{ch.icon}</span>
            ) : null}
            <span>{ch.name}</span>
            {unread > 0 && !isActive && (
              <span className="ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
