"use client";

import Link from "next/link";

export default function EnableCustodyLink({ variant = "setup" }: { variant?: "setup" | "edit" }) {
  const isSetup = variant === "setup";
  return (
    <Link
      href="/calendario/escala"
      className="flex items-center gap-3 rounded-xl bg-[#5B9E85] hover:bg-[#4F8A74] active:scale-[0.99] text-white p-4 shadow-sm transition-all"
    >
      <span className="flex w-10 h-10 items-center justify-center rounded-xl bg-white/20 shrink-0" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold leading-tight">
          {isSetup ? "Configurar escala de guarda" : "Editar escala de guarda"}
        </p>
        <p className="text-[12px] text-white/75 mt-0.5">
          {isSetup
            ? "Definir quem fica com as crianças em cada dia"
            : "Ajustar padrão de 14 dias e regerar eventos"}
        </p>
      </div>
      <svg className="w-4 h-4 text-white/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
