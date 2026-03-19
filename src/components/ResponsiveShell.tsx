"use client";

import { useIsDesktop } from "@/hooks/useIsDesktop";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import Link from "next/link";

export default function ResponsiveShell({
  initial,
  fullName,
  children,
}: {
  initial: string;
  fullName: string;
  children: React.ReactNode;
}) {
  const isDesktop = useIsDesktop();

  return (
    <>
      {/* Desktop: Sidebar */}
      {isDesktop && <Sidebar initial={initial} fullName={fullName} />}

      {/* Mobile: Top Bar */}
      {!isDesktop && (
        <header className="px-5 pt-4 pb-2 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold text-[#1A3B3A] tracking-tight">2Lares</Link>
          <div className="flex items-center gap-2">
            <Link href="/eventos" className="relative p-2 rounded-full hover:bg-black/[0.03] transition-colors">
              <svg className="w-[22px] h-[22px] text-[#1A3B3A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </Link>
            <Link href="/perfil" className="w-9 h-9 rounded-full bg-[#1A3B3A] flex items-center justify-center text-white font-semibold text-sm">
              {initial}
            </Link>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={isDesktop ? "pl-64" : ""}>
        <div className={isDesktop ? "max-w-4xl mx-auto px-8 py-6 pb-8" : "max-w-4xl mx-auto px-5 py-4 pb-24"}>
          {children}
        </div>
      </main>

      {/* Mobile: Bottom Nav */}
      {!isDesktop && <BottomNav />}
    </>
  );
}
