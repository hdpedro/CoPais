"use client";

import { useState } from "react";
import { formatActivityShareText, shareText, type ShareActivityData } from "@/lib/share-utils";

interface ShareActivityButtonProps {
  activity: ShareActivityData;
  size?: "sm" | "md";
}

export default function ShareActivityButton({ activity, size = "md" }: ShareActivityButtonProps) {
  const [shared, setShared] = useState(false);

  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const text = formatActivityShareText(activity);
    const ok = await shareText(text);
    if (ok) {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  }

  const dim = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const iconSize = size === "sm" ? "12" : "14";

  if (shared) {
    return (
      <span className={`${dim} flex items-center justify-center rounded-lg text-[#25D366]`}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`${dim} flex items-center justify-center rounded-lg hover:bg-green-50 text-[#7A8C8B] hover:text-[#25D366] transition-colors`}
      title="Compartilhar"
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    </button>
  );
}
