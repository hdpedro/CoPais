"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

interface Feature {
  href: string;
  labelKey: string;
  color: string;
  icon: React.ReactNode;
}

const features: Feature[] = [
  {
    href: "/dashboard",
    labelKey: "nav.home",
    color: "#5B9E85",
    icon: (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    ),
  },
  {
    href: "/calendario",
    labelKey: "nav.calendar",
    color: "#3B82F6",
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
    href: "/financeiro",
    labelKey: "nav.sectionFinancial",
    color: "#5B9E85",
    icon: (
      <>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </>
    ),
  },
  {
    href: "/despesas",
    labelKey: "nav.expenses",
    color: "#D4735A",
    icon: (
      <>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </>
    ),
  },
  {
    href: "/chat",
    labelKey: "nav.chat",
    color: "#8B5CF6",
    icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  },
  {
    href: "/criancas",
    labelKey: "nav.children",
    color: "#D4735A",
    icon: (
      <>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
  {
    href: "/saude",
    labelKey: "nav.health",
    color: "#EF4444",
    icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  },
  {
    href: "/documentos",
    labelKey: "nav.documents",
    color: "#F59E0B",
    icon: (
      <>
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </>
    ),
  },
  {
    href: "/decisoes",
    labelKey: "nav.decisions",
    color: "#8B5CF6",
    icon: (
      <>
        <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
  },
  {
    href: "/acordos",
    labelKey: "nav.agreements",
    color: "#5B9E85",
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
    href: "/escola",
    labelKey: "nav.school",
    color: "#6366F1",
    icon: (
      <>
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </>
    ),
  },
  {
    href: "/checkin",
    labelKey: "nav.checkin",
    color: "#3B82F6",
    icon: (
      <>
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </>
    ),
  },
  {
    href: "/temas-sensiveis",
    labelKey: "nav.sensitiveTopics",
    color: "#6B7280",
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  },
  {
    href: "/familia",
    labelKey: "nav.family",
    color: "#5B9E85",
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
    href: "/notas",
    labelKey: "nav.notes",
    color: "#6366F1",
    icon: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </>
    ),
  },
  {
    href: "/convite/enviar",
    labelKey: "nav.inviteGuardian",
    color: "#8B5CF6",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <line x1="20" y1="8" x2="20" y2="14" />
        <line x1="23" y1="11" x2="17" y2="11" />
      </>
    ),
  },
];

export default function MaisPage() {
  const { t } = useI18n();

  return (
    <div className="pb-20">
      <h1 className="text-[22px] font-bold text-[#2C2C2C] mb-1 tracking-tight">{t("nav.more")}</h1>
      <p className="text-[13px] text-[#7A8C8B] mb-6">Kindar</p>
      <div className="grid grid-cols-3 gap-3">
        {features.map((f) => {
          const label = t(f.labelKey);
          return (
            <Link
              key={f.href}
              href={f.href}
              aria-label={label}
              className="flex flex-col items-center justify-center gap-2.5 bg-white rounded-2xl p-4 border border-gray-100/80 hover:shadow-sm transition-all active:scale-95 min-h-[96px]"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: f.color + "10" }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={f.color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {f.icon}
                </svg>
              </div>
              <span className="text-[11px] font-medium text-[#2C2C2C] text-center leading-tight">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
