"use client";

import { useState } from "react";
import Link from "next/link";

interface OnboardingChecklistProps {
  step: number; // 0-4
  hasGroup: boolean;
  hasChild: boolean;
  hasInvite: boolean;
}

export default function OnboardingChecklist({ step, hasGroup, hasChild, hasInvite }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("kindar-onboarding-dismissed") === "true";
  });

  if (step >= 4 || dismissed) return null;

  const completed = [hasGroup, hasChild, hasInvite].filter(Boolean).length;
  const progress = Math.round((completed / 3) * 100);

  const steps = [
    { done: hasGroup, label: "Criar grupo familiar", href: "/onboarding", icon: "👨‍👩‍👧" },
    { done: hasChild, label: "Cadastrar crianca", href: "/criancas", icon: "👶" },
    { done: hasInvite, label: "Convidar responsavel", href: "/convite/enviar", icon: "📲" },
  ];

  function handleDismiss() {
    localStorage.setItem("kindar-onboarding-dismissed", "true");
    setDismissed(true);
  }

  return (
    <div className="bg-gradient-to-br from-[#C07055]/[0.06] to-[#C07055]/[0.02] border border-[#C07055]/12 rounded-2xl p-5 relative">
      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 w-6 h-6 rounded-full bg-black/5 flex items-center justify-center text-[#9A8878] hover:bg-black/10 transition-colors"
        aria-label="Fechar"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      <div className="mb-4">
        <p className="text-[15px] font-bold text-[#0E0C0A]">Configure seu Kindar</p>
        <p className="text-[12px] text-[#9A8878] mt-0.5">{completed}/3 passos concluidos</p>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-black/[0.04] rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-[#C07055] rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((s, i) => (
          <Link
            key={i}
            href={s.done ? "#" : s.href}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              s.done
                ? "bg-[#2E7268]/[0.06] cursor-default"
                : "bg-white hover:bg-white/80 shadow-sm active:scale-[0.98]"
            }`}
            onClick={s.done ? (e) => e.preventDefault() : undefined}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
              s.done ? "bg-[#2E7268]/10" : "bg-[#C07055]/10"
            }`}>
              {s.done ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2E7268" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span>{s.icon}</span>
              )}
            </div>
            <span className={`text-[13px] font-medium flex-1 ${s.done ? "text-[#2E7268] line-through" : "text-[#0E0C0A]"}`}>
              {s.label}
            </span>
            {!s.done && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4BEB6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
