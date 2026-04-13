"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { hapticLight } from "@/lib/haptics";

const navIcons = {
  home: (active: boolean) => (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  calendar: (active: boolean) => (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  chat: (active: boolean) => (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  health: (active: boolean) => (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  more: (active: boolean) => (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
};

export default memo(function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  const navItems = [
    { href: "/dashboard", labelKey: "nav.home", icon: navIcons.home },
    { href: "/calendario", labelKey: "nav.calendar", icon: navIcons.calendar },
    { href: "/chat", labelKey: "nav.chat", icon: navIcons.chat },
    { href: "/saude", labelKey: "nav.health", icon: navIcons.health },
    { href: "/mais", labelKey: "nav.more", icon: navIcons.more },
  ];

  return (
    <nav aria-label={t("nav.home")} className="fixed bottom-0 left-0 right-0 z-40">
      <div className="bg-white/80 backdrop-blur-2xl border-t border-black/[0.04] px-2 pt-1.5 safe-area-bottom flex justify-around">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
          const label = t(item.labelKey);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              onClick={() => hapticLight()}
              className={`flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center transition-colors active:scale-95 ${
                active ? "text-[#D4735A]" : "text-[#9CA3AF] hover:text-[#6B7280]"
              }`}
            >
              {item.icon(active)}
              <span className={`text-[10px] tracking-wide ${active ? "font-semibold text-[#D4735A]" : "font-medium"}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
});
