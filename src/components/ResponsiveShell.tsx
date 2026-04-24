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

  // Native WebView mode: quando o app iOS/Android abre paginas via WebView,
  // anexa ?native=1 na URL. Nesse caso, escondemos TODO o shell (sidebar,
  // header mobile, bottom nav, AI assistant) porque o app nativo ja renderiza
  // sua propria navegacao. O flag persiste via sessionStorage para nav interna.
  //
  // setTimeout-wrap evita lint react-hooks/set-state-in-effect e tambem
  // serve pra adiar o setState pra proximo tick (zero perceptivel).
  const [isNativeWebView, setIsNativeWebView] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      const fromQuery = new URLSearchParams(window.location.search).get("native") === "1";
      const fromStorage = sessionStorage.getItem("kindar-native-webview") === "1";
      if (fromQuery) {
        try { sessionStorage.setItem("kindar-native-webview", "1"); } catch {}
      }
      setIsNativeWebView(fromQuery || fromStorage);
    }, 0);
    return () => clearTimeout(t);
  }, []);

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

  // Native WebView: return children raw. Pagina PWA renderiza full-screen
  // sem shell (logo, sidebar, bottom nav) — o app nativo fornece navegacao.
  if (isNativeWebView) {
    return (
      <main className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-5 py-4 pb-6 native-webview">
          {children}
        </div>
      </main>
    );
  }

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
            <a
              href="https://wa.me/5521999605044?text=Oi%20Kindar!"
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/[0.03] active:bg-black/[0.06] transition-colors"
              aria-label="WhatsApp Kindar"
            >
              <svg className="w-[22px] h-[22px] text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
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
