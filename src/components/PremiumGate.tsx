"use client";

import Link from "next/link";
import { useSubscription } from "./SubscriptionProvider";
import { canAccess } from "@/lib/feature-gate";

export default function PremiumGate({
  feature,
  children,
  fallback,
}: {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { tier } = useSubscription();

  if (canAccess(feature, tier)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm text-center">
      <div className="w-12 h-12 rounded-full bg-[#C07055]/10 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-[#C07055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-[#0E0C0A] mb-1">Funcionalidade Premium</h3>
      <p className="text-sm text-[#9A8878] mb-4">Faca upgrade para acessar este recurso.</p>
      <Link
        href="/pricing"
        className="inline-block px-6 py-2.5 bg-[#C07055] text-white text-sm font-semibold rounded-lg hover:bg-[#A85D47] transition-colors"
      >
        Ver planos
      </Link>
    </div>
  );
}
