"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/dashboard",
    label: "Inicio",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3l9-8z" />
      </svg>
    ),
  },
  {
    href: "/calendario",
    label: "Agenda",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <rect x="7" y="14" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Chat",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        <circle cx="8.5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="12" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/familia",
    label: "Familia",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="9" cy="7" r="3" />
        <circle cx="17" cy="7" r="2.5" />
        <path d="M2 21v-1a5 5 0 0110 0v1" />
        <path d="M14 21v-1a4 4 0 016 0v1" />
      </svg>
    ),
  },
  {
    href: "/mais",
    label: "Mais",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-2 py-2 flex justify-around md:hidden safe-area-bottom">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center transition-colors ${
              active ? "text-[#E8734A]" : "text-[#7A8C8B] hover:text-[#1A3B3A]"
            }`}
          >
            {item.icon}
            <span className={`text-[10px] font-medium ${active ? "text-[#E8734A]" : ""}`}>{item.label}</span>
            {active && <span className="w-1 h-1 rounded-full bg-[#E8734A] -mt-0.5" />}
          </Link>
        );
      })}
    </nav>
  );
}
