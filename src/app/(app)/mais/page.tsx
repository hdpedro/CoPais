import Link from "next/link";

const features = [
  {
    href: "/dashboard",
    label: "Inicio",
    color: "#0EA5A0",
    icon: (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    ),
  },
  {
    href: "/calendario",
    label: "Calendario",
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
    label: "Financeiro",
    color: "#0EA5A0",
    icon: (
      <>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </>
    ),
  },
  {
    href: "/despesas",
    label: "Despesas",
    color: "#E8734A",
    icon: (
      <>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </>
    ),
  },
  {
    href: "/chat",
    label: "Chat",
    color: "#8B5CF6",
    icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  },
  {
    href: "/criancas",
    label: "Criancas",
    color: "#E8734A",
    icon: (
      <>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
  {
    href: "/saude",
    label: "Saude",
    color: "#EF4444",
    icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  },
  {
    href: "/documentos",
    label: "Documentos",
    color: "#F59E0B",
    icon: (
      <>
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </>
    ),
  },
  {
    href: "/acordos",
    label: "Acordos",
    color: "#0EA5A0",
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
    href: "/eventos",
    label: "Eventos",
    color: "#E8734A",
    icon: (
      <>
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </>
    ),
  },
  {
    href: "/escola",
    label: "Escola",
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
    label: "Check-in",
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
    label: "Temas Sensiveis",
    color: "#6B7280",
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  },
  {
    href: "/familia",
    label: "Familia",
    color: "#0EA5A0",
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
    href: "/convite/enviar",
    label: "Convidar",
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
  return (
    <div className="pb-20">
      <h1 className="text-[22px] font-bold text-[#1A3B3A] mb-1 tracking-tight">Todas as funcionalidades</h1>
      <p className="text-[13px] text-[#7A8C8B] mb-6">Acesse todas as areas do 2Lares</p>
      <div className="grid grid-cols-3 gap-3">
        {features.map((f) => (
          <Link
            key={f.href}
            href={f.href}
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
            <span className="text-[11px] font-medium text-[#1A3B3A] text-center leading-tight">
              {f.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
