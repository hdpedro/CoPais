"use client";

import { useState, useEffect } from "react";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import GroupSelector from "./GroupSelector";
import NotificationBadge from "./NotificationBadge";
import KindarLogo from "./KindarLogo";
import AIAssistant from "./AIAssistant";
import Link from "next/link";

export default function ResponsiveShell({
  initial,
  fullName,
  groups,
  activeGroupId,
  userId,
  children,
}: {
  initial: string;
  fullName: string;
  groups: Array<{ id: string; name: string }>;
  activeGroupId: string;
  userId: string;
  children: React.ReactNode;
}) {
  const isDesktop = useIsDesktop();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Detect virtual keyboard on mobile (iOS/Android)
  useEffect(() => {
    if (isDesktop) return;

    // Use visualViewport API (best support on modern iOS/Android)
    const vv = window.visualViewport;
    if (vv) {
      const handleResize = () => {
        // When keyboard opens, visualViewport height is significantly smaller than window height
        const keyboardOpen = vv.height < window.innerHeight * 0.75;
        setIsKeyboardOpen(keyboardOpen);
      };
      vv.addEventListener("resize", handleResize);
      return () => vv.removeEventListener("resize", handleResize);
    }

    // Fallback for older browsers
    const handleResize = () => {
      const keyboardOpen = window.innerHeight < window.outerHeight * 0.75;
      setIsKeyboardOpen(keyboardOpen);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isDesktop]);

  return (
    <>
      {/* Desktop: Sidebar */}
      {isDesktop && <Sidebar initial={initial} fullName={fullName} groups={groups} activeGroupId={activeGroupId} userId={userId} />}

      {/* Mobile: Top Bar — fixed at top */}
      {!isDesktop && (
        <header className="fixed top-0 left-0 right-0 z-40 bg-[#EEECEA]/80 backdrop-blur-2xl px-5 pb-2 flex items-center justify-between safe-area-top">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="flex items-center gap-1.5">
              <KindarLogo size={28} />
              <span className="text-xl font-bold text-[#2C2C2C] tracking-tight">Kindar</span>
            </Link>
            <GroupSelector groups={groups} activeGroupId={activeGroupId} />
          </div>
          <div className="flex items-center gap-1">
            {activeGroupId && <AIAssistant groupId={activeGroupId} isMobile />}
            <Link href="/notificacoes" className="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/[0.03] active:bg-black/[0.06] transition-colors">
              <svg className="w-[22px] h-[22px] text-[#2C2C2C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              <NotificationBadge userId={userId} />
            </Link>
            <Link href="/perfil" className="w-10 h-10 rounded-full bg-[#2C2C2C] flex items-center justify-center text-white font-semibold text-sm">
              {initial}
            </Link>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={isDesktop ? "pl-64" : "pt-[max(60px,calc(48px+env(safe-area-inset-top)))]"}>
        <div className={isDesktop ? "max-w-4xl mx-auto px-8 py-6 pb-8" : "page-transition max-w-4xl mx-auto px-5 py-4 pb-24"}>
          {children}
        </div>
      </main>

      {/* Mobile: Bottom Nav — hidden when keyboard is open */}
      {!isDesktop && !isKeyboardOpen && <BottomNav />}

      {/* AI Assistant — desktop only (floating), mobile is in header */}
      {isDesktop && activeGroupId && <AIAssistant groupId={activeGroupId} />}
    </>
  );
}
