"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getPaymentPlatform } from "@/lib/payment-platform";

interface Plan {
  id: string;
  name: string;
  description: string;
  priceBrl: number;
  interval: string;
  stripePriceId: string | null;
  features: string[];
}

interface PricingClientProps {
  plans: Plan[];
  currentPlanId: string;
  isLoggedIn: boolean;
}

const FEATURE_LABELS: Record<string, string> = {
  calendar_basic: "Calendario compartilhado",
  calendar_full: "Calendario completo",
  expenses_basic: "Despesas basicas",
  expenses_full: "Despesas ilimitadas",
  chat: "Chat da familia",
  custody_basic: "Guarda compartilhada",
  custody_full: "Guarda completa + trocas",
  ai_assistant: "Assistente IA",
  documents_unlimited: "Documentos ilimitados",
  health_full: "Saude completa",
  reports: "Relatorios",
  export_pdf: "Exportacao PDF",
};

export default function PricingClient({ plans, currentPlanId, isLoggedIn }: PricingClientProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();
  const platform = getPaymentPlatform();

  async function handleSubscribe(plan: Plan) {
    if (!isLoggedIn) {
      router.push("/signup");
      return;
    }

    if (plan.id === "free") return;

    if (platform === "apple_iap") {
      alert("Assinatura via App Store sera disponibilizada em breve. Use a versao web por enquanto.");
      return;
    }

    if (!plan.stripePriceId) {
      alert("Plano ainda nao configurado. Entre em contato com o suporte.");
      return;
    }

    setLoading(plan.id);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: plan.stripePriceId, planId: plan.id }),
      });
      const data = await res.json();
      if (data.url) {
        globalThis.location.assign(data.url);
      } else {
        alert(data.error || "Erro ao iniciar pagamento");
        setLoading(null);
      }
    } catch {
      alert("Erro de conexao. Tente novamente.");
      setLoading(null);
    }
  }

  async function handleManage() {
    setLoading("manage");
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.url) {
        globalThis.location.assign(data.url);
      } else {
        alert("Erro ao abrir portal de assinatura");
        setLoading(null);
      }
    } catch {
      alert("Erro de conexao");
      setLoading(null);
    }
  }

  const isPremiumUser = currentPlanId.startsWith("premium");

  return (
    <div className="min-h-screen bg-[#EEECEA]">
      {/* Header */}
      <div className="bg-white border-b border-[#E8E0D4]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href={isLoggedIn ? "/dashboard" : "/"} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kindar-logo.png" alt="" width={28} height={28} className="object-contain" />
            <span className="text-xl font-bold text-[#2C2C2C] tracking-tight">Kindar</span>
          </Link>
          {isLoggedIn && (
            <Link href="/dashboard" className="text-sm text-[#C07055] font-medium hover:underline">
              Voltar ao app
            </Link>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 pt-12 pb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#0E0C0A] tracking-tight">
          Escolha seu plano
        </h1>
        <p className="mt-3 text-[#9A8878] text-lg">
          Comece gratis. Faca upgrade quando quiser.
        </p>
      </div>

      {/* Plans */}
      <div className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isFree = plan.id === "free";
            const isPopular = plan.id === "premium_monthly";
            const priceDisplay = isFree
              ? "R$ 0"
              : `R$ ${(plan.priceBrl / 100).toFixed(2).replace(".", ",")}`;
            const intervalLabel = plan.interval === "year" ? "/ano" : plan.interval === "month" ? "/mes" : "";

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl p-6 shadow-sm border-2 transition-all ${
                  isPopular
                    ? "border-[#C07055] shadow-lg shadow-[#C07055]/10 scale-[1.02]"
                    : "border-transparent hover:border-[#E8E0D4]"
                }`}
              >
                {/* Popular badge */}
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#C07055] text-white text-xs font-bold rounded-full uppercase tracking-wider">
                    Mais popular
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-[#0E0C0A]">{plan.name}</h3>
                  <p className="text-sm text-[#9A8878] mt-1">{plan.description}</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-3xl font-extrabold text-[#0E0C0A]">{priceDisplay}</span>
                  <span className="text-[#9A8878] ml-1">{intervalLabel}</span>
                  {plan.id === "premium_annual" && (
                    <div className="mt-1 text-xs text-[#2E7268] font-semibold">
                      Economize 17% vs mensal
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-[#2C2C2C]">
                      <svg className="w-4 h-4 text-[#2E7268] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {FEATURE_LABELS[f] || f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <div className="text-center">
                    <span className="inline-block px-4 py-2.5 bg-[#2E7268]/10 text-[#2E7268] font-semibold text-sm rounded-lg">
                      Plano atual
                    </span>
                    {isPremiumUser && (
                      <button
                        onClick={handleManage}
                        disabled={loading === "manage"}
                        className="block w-full mt-3 text-sm text-[#C07055] hover:underline disabled:opacity-50"
                      >
                        {loading === "manage" ? "Abrindo..." : "Gerenciar assinatura"}
                      </button>
                    )}
                  </div>
                ) : isFree && isPremiumUser ? (
                  <button
                    onClick={handleManage}
                    disabled={loading === "manage"}
                    className="w-full py-2.5 text-sm font-medium text-[#9A8878] border border-[#E8E0D4] rounded-lg hover:bg-[#F5EFE6] transition-colors disabled:opacity-50"
                  >
                    {loading === "manage" ? "Abrindo..." : "Fazer downgrade"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe(plan)}
                    disabled={loading === plan.id || isFree}
                    className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      isPopular
                        ? "bg-[#C07055] text-white hover:bg-[#A85D47]"
                        : isFree
                          ? "bg-[#F5EFE6] text-[#9A8878] cursor-default"
                          : "bg-[#0E0C0A] text-white hover:bg-[#2C2C2C]"
                    }`}
                  >
                    {loading === plan.id
                      ? "Redirecionando..."
                      : isFree
                        ? "Plano gratuito"
                        : isLoggedIn
                          ? "Assinar agora"
                          : "Criar conta gratis"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-[#9A8878] mt-8">
          Cancele quando quiser. Sem fidelidade. Pagamento seguro via Stripe.
        </p>
      </div>
    </div>
  );
}
