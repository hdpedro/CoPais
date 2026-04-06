"use client";

import { useState, useEffect } from "react";

interface FeatureTooltipProps {
  id: string;
  message: string;
  children: React.ReactNode;
}

export default function FeatureTooltip({ id, message, children }: FeatureTooltipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const key = `kindar-tooltip-${id}-seen`;
    const seen = localStorage.getItem(key);
    if (!seen) {
      // Show after a brief delay for smoother UX
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, [id]);

  function dismiss() {
    localStorage.setItem(`kindar-tooltip-${id}-seen`, "true");
    setVisible(false);
  }

  return (
    <div className="relative">
      {children}
      {visible && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-[#0E0C0A] text-white text-[12px] font-medium px-4 py-2.5 rounded-xl shadow-lg max-w-[240px] text-center relative">
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0E0C0A] rotate-45 rounded-sm" />
            <p className="relative">{message}</p>
            <button
              onClick={dismiss}
              className="mt-1.5 text-[10px] text-white/50 hover:text-white/80 transition-colors"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
