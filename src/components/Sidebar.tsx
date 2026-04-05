"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import GroupSelector from "./GroupSelector";
import NotificationBadge from "./NotificationBadge";
import KindarLogo from "./KindarLogo";
import { useI18n } from "@/i18n/provider";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
}

interface NavSection {
  titleKey: string | null;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    titleKey: null,
    items: [
      {
        href: "/dashboard",
        labelKey: "nav.home",
        icon: (
          <>
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </>
        ),
      },
    ],
  },
  {
    titleKey: "nav.sectionOrganization",
    items: [
      {
        href: "/calendario",
        labelKey: "nav.calendar",
        icon: (
          <>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </>
        ),
      },
      {
        href: "/checkin",
        labelKey: "nav.checkin",
        icon: (
          <>
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </>
        ),
      },
    ],
  },
  {
    titleKey: "nav.sectionCommunication",
    items: [
      {
        href: "/chat",
        labelKey: "nav.chat",
        icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
      },
      {
        href: "/acordos",
        labelKey: "nav.agreements",
        icon: (
          <>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </>
        ),
      },
      {
        href: "/decisoes",
        labelKey: "nav.decisions",
        icon: (
          <>
            <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
            <circle cx="12" cy="12" r="4" />
          </>
        ),
      },
      {
        href: "/temas-sensiveis",
        labelKey: "nav.sensitiveTopics",
        icon: (
          <>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </>
        ),
      },
    ],
  },
  {
    titleKey: "nav.sectionFamily",
    items: [
      {
        href: "/criancas",
        labelKey: "nav.children",
        icon: (
          <>
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </>
        ),
      },
      {
        href: "/familia",
        labelKey: "nav.family",
        icon: (
          <>
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </>
        ),
      },
      {
        href: "/saude",
        labelKey: "nav.health",
        icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
      },
      {
        href: "/escola",
        labelKey: "nav.school",
        icon: (
          <>
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </>
        ),
      },
    ],
  },
  {
    titleKey: "nav.sectionFinancial",
    items: [
      {
        href: "/semana",
        labelKey: "nav.weeklyAnalysis",
        icon: (
          <>
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </>
        ),
      },
      {
        href: "/despesas",
        labelKey: "nav.expenses",
        icon: (
          <>
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </>
        ),
      },
      {
        href: "/documentos",
        labelKey: "nav.documents",
        icon: (
          <>
            <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </>
        ),
      },
    ],
  },
  {
    titleKey: "nav.sectionAccount",
    items: [
      {
        href: "/convite/enviar",
        labelKey: "nav.inviteGuardian",
        icon: (
          <>
            <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </>
        ),
      },
    ],
  },
];

export default function Sidebar({ initial, fullName, groups, activeGroupId, userId }: { initial: string; fullName: string; groups: Array<{ id: string; name: string }>; activeGroupId: string; userId: string }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <aside role="navigation" aria-label={t("nav.sectionOrganization")} className="flex flex-col fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-100 z-40">
      {/* Logo */}
      <div className="px-6 pt-6 pb-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <KindarLogo size={28} />
          <span className="text-xl font-bold text-[#2C2C2C] tracking-tight">Kindar</span>
        </Link>
      </div>

      {/* Notifications link */}
      <div className="px-3 pb-2">
        <Link
          href="/notificacoes"
          prefetch={false}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
            pathname === "/notificacoes"
              ? "bg-[#D4735A]/[0.08] text-[#D4735A]"
              : "text-[#5A6B6A] hover:bg-[#FFF3E0]/50 hover:text-[#2C2C2C]"
          }`}
        >
          <span className="relative flex-shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={pathname === "/notificacoes" ? 2 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            <NotificationBadge userId={userId} />
          </span>
          {t("notifications.title")}
        </Link>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {navSections.map((section, si) => (
          <div key={si}>
            {section.titleKey && (
              <p className="px-3 mb-1.5 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                {t(section.titleKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
                const label = t(item.labelKey);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
                      active
                        ? "bg-[#D4735A]/[0.08] text-[#D4735A]"
                        : "text-[#5A6B6A] hover:bg-[#FFF3E0]/50 hover:text-[#2C2C2C]"
                    }`}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={active ? 2 : 1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="flex-shrink-0"
                    >
                      {item.icon}
                    </svg>
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User profile at bottom */}
      <div className="border-t border-gray-100 px-4 py-4 space-y-3">
        {groups.length > 1 && (
          <div className="px-2">
            <GroupSelector groups={groups} activeGroupId={activeGroupId} />
          </div>
        )}
        <Link href="/perfil" className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors">
          <div className="w-9 h-9 rounded-full bg-[#2C2C2C] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#2C2C2C] truncate">{fullName}</p>
            <p className="text-[10px] text-[#9CA3AF]">{t("nav.viewProfile")}</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>
    </aside>
  );
}
