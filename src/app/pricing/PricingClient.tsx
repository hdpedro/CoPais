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

// Group plans by tier (free / premium / elite), each with monthly + annual variants
type Tier = { name: string; tagline: string; monthly: Plan | null; annual: Plan | null };

function groupByTier(plans: Plan[]): Tier[] {
  const free = plans.find((p) => p.id === "free");
  const premiumM = plans.find((p) => p.id === "premium_monthly");
  const premiumA = plans.find((p) => p.id === "premium_annual");
  const eliteM = plans.find((p) => p.id === "elite_monthly");
  const eliteA = plans.find((p) => p.id === "elite_annual");

  return [
    { name: "Free", tagline: "Degustacao Solo", monthly: free || null, annual: null },
    { name: "Premium", tagline: "Rede de Apoio e Colaboracao", monthly: premiumM || null, annual: premiumA || null },
    { name: "Elite", tagline: "Suporte VIP e Backup Juridico", monthly: eliteM || null, annual: eliteA || null },
  ];
}

export default function PricingClient({ plans, currentPlanId, isLoggedIn }: PricingClientProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const router = useRouter();
  const platform = getPaymentPlatform();
  const tiers = groupByTier(plans);

  const isPaidUser = currentPlanId.startsWith("premium") || currentPlanId.startsWith("elite");

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
      <div className="max-w-5xl mx-auto px-4 pt-12 pb-4 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#0E0C0A] tracking-tight">
          Escolha o plano ideal para sua familia
        </h1>
        <p className="mt-3 text-[#9A8878] text-lg max-w-xl mx-auto">
          Comece com 14 dias gratis no Premium. Cancele quando quiser.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 py-6">
        <button
          onClick={() => setBillingCycle("monthly")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            billingCycle === "monthly"
              ? "bg-[#0E0C0A] text-white"
              : "bg-white text-[#9A8878] border border-[#E8E0D4] hover:border-[#C07055]"
          }`}
        >
          Mensal
        </button>
        <button
          onClick={() => setBillingCycle("annual")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors relative ${
            billingCycle === "annual"
              ? "bg-[#0E0C0A] text-white"
              : "bg-white text-[#9A8878] border border-[#E8E0D4] hover:border-[#C07055]"
          }`}
        >
          Anual
          <span className="absolute -top-2.5 -right-3 px-1.5 py-0.5 bg-[#2E7268] text-white text-[10px] font-bold rounded-full">
            -17%
          </span>
        </button>
      </div>

      {/* Plans Grid */}
      <div className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier) => {
            const activePlan = tier.name === "Free"
              ? tier.monthly
              : billingCycle === "annual" && tier.annual
                ? tier.annual
                : tier.monthly;

            if (!activePlan) return null;

            const isFree = tier.name === "Free";
            const isPremium = tier.name === "Premium";
            const isElite = tier.name === "Elite";
            const isCurrent = activePlan.id === currentPlanId;

            const priceDisplay = isFree
              ? "R$ 0"
              : `R$ ${(activePlan.priceBrl / 100).toFixed(2).replace(".", ",")}`;

            const intervalLabel = isFree ? "" : billingCycle === "annual" ? "/ano" : "/mes";

            // Calculate monthly equivalent for annual
            const monthlyEquiv = billingCycle === "annual" && !isFree
              ? `R$ ${(activePlan.priceBrl / 100 / 12).toFixed(2).replace(".", ",")}/mes`
              : null;

            // Savings text
            const savingsText = billingCycle === "annual" && isPremium
              ? "Economize R$ 61,80"
              : billingCycle === "annual" && isElite
                ? "Economize R$ 101,80"
                : null;

            // Feature list for display (curated, not raw)
            const displayFeatures = isFree
              ? ["1 usuario", "1 crianca", "Calendario basico", "Despesas basicas", "Guarda basica"]
              : isPremium
                ? ["Usuarios ilimitados", "Criancas ilimitadas", "Calendario completo", "Despesas ilimitadas", "Chat da familia", "Guarda completa + trocas", "Assistente IA Kindar", "Saude completa", "Suporte prioritario"]
                : ["Tudo do Premium, mais:", "Suporte VIP dedicado", "Backup juridico", "Relatorios detalhados", "Exportacao PDF", "Backup de dados"];

            return (
              <div
                key={activePlan.id}
                className={`relative bg-white rounded-2xl p-6 shadow-sm border-2 transition-all ${
                  isPremium
                    ? "border-[#C07055] shadow-lg shadow-[#C07055]/10 md:scale-[1.03]"
                    : isElite
                      ? "border-[#2E7268]/30"
                      : "border-transparent hover:border-[#E8E0D4]"
                }`}
              >
                {/* Popular badge */}
                {isPremium && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#C07055] text-white text-xs font-bold rounded-full uppercase tracking-wider whitespace-nowrap">
                    Mais popular
                  </div>
                )}

                {/* Elite badge */}
                {isElite && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#2E7268] text-white text-xs font-bold rounded-full uppercase tracking-wider whitespace-nowrap">
                    Mais completo
                  </div>
                )}

                <div className="mb-5">
                  <h3 className="text-lg font-bold text-[#0E0C0A]">{tier.name}</h3>
                  <p className="text-sm text-[#9A8878] mt-1">{tier.tagline}</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-3xl font-extrabold text-[#0E0C0A]">{priceDisplay}</span>
                  <span className="text-[#9A8878] ml-1 text-sm">{intervalLabel}</span>
                  {monthlyEquiv && (
                    <p className="text-xs text-[#9A8878] mt-1">
                      equivale a {monthlyEquiv}
                    </p>
                  )}
                  {savingsText && (
                    <p className="mt-1 text-xs text-[#2E7268] font-semibold">
                      {savingsText}
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5 mb-8">
                  {displayFeatures.map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-sm ${f.endsWith(":") ? "font-semibold text-[#2E7268] mt-1" : "text-[#2C2C2C]"}`}>
                      {!f.endsWith(":") && (
                        <svg className="w-4 h-4 text-[#2E7268] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <div className="text-center">
                    <span className="inline-block w-full px-4 py-2.5 bg-[#2E7268]/10 text-[#2E7268] font-semibold text-sm rounded-lg">
                      Plano atual
                    </span>
                    {isPaidUser && (
                      <button
                        onClick={handleManage}
                        disabled={loading === "manage"}
                        className="block w-full mt-3 text-sm text-[#C07055] hover:underline disabled:opacity-50"
                      >
                        {loading === "manage" ? "Abrindo..." : "Gerenciar assinatura"}
                      </button>
                    )}
                  </div>
                ) : isFree ? (
                  <div className="text-center">
                    {isPaidUser ? (
                      <button
                        onClick={handleManage}
                        disabled={loading === "manage"}
                        className="w-full py-2.5 text-sm font-medium text-[#9A8878] border border-[#E8E0D4] rounded-lg hover:bg-[#F5EFE6] transition-colors disabled:opacity-50"
                      >
                        {loading === "manage" ? "Abrindo..." : "Fazer downgrade"}
                      </button>
                    ) : (
                      <span className="inline-block w-full px-4 py-2.5 bg-[#F5EFE6] text-[#9A8878] font-medium text-sm rounded-lg">
                        Plano atual
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => handleSubscribe(activePlan)}
                    disabled={loading === activePlan.id}
                    className={`w-full py-3 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                      isPremium
                        ? "bg-[#C07055] text-white hover:bg-[#A85D47] shadow-md shadow-[#C07055]/20"
                        : "bg-[#0E0C0A] text-white hover:bg-[#2C2C2C]"
                    }`}
                  >
                    {loading === activePlan.id
                      ? "Redirecionando..."
                      : isLoggedIn
                        ? "Comecar trial de 14 dias"
                        : "Criar conta e testar gratis"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Trust signals */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10 text-xs text-[#9A8878]">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Pagamento seguro via Stripe
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancele quando quiser, sem fidelidade
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            14 dias gratis para testar
          </span>
        </div>
      </div>
    </div>
  );
}
