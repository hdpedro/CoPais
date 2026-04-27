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
  appleProductId: string | null;
  features: string[];
}

interface EarlyBirdView {
  planId: string;
  slotsRemaining: number;
  maxSubscribers: number;
  isSoldOut: boolean;
}

interface PricingClientProps {
  plans: Plan[];
  currentPlanId: string;
  isLoggedIn: boolean;
  earlyBird?: EarlyBirdView[];
}

// Group plans by tier (free / harmonia / premium_juridico). Falls back to
// legacy IDs so grandfathered subs keep rendering while the rollout is in
// progress.
type Tier = { name: string; tagline: string; monthly: Plan | null; annual: Plan | null };

function groupByTier(plans: Plan[]): Tier[] {
  const free = plans.find((p) => p.id === "free");
  const harmoniaM = plans.find((p) => p.id === "harmonia_monthly") ?? plans.find((p) => p.id === "premium_monthly");
  const harmoniaA = plans.find((p) => p.id === "harmonia_annual") ?? plans.find((p) => p.id === "premium_annual");
  const juridicoM = plans.find((p) => p.id === "premium_juridico_monthly") ?? plans.find((p) => p.id === "elite_monthly");
  const juridicoA = plans.find((p) => p.id === "premium_juridico_annual") ?? plans.find((p) => p.id === "elite_annual");

  return [
    { name: "Gratis", tagline: "Organizacao basica para comecar", monthly: free || null, annual: null },
    { name: "Harmonia", tagline: "Uma assinatura, familia inteira acessa", monthly: harmoniaM || null, annual: harmoniaA || null },
    { name: "Premium Juridico", tagline: "Para quem precisa de audit trail e export legal", monthly: juridicoM || null, annual: juridicoA || null },
  ];
}

export default function PricingClient({ plans, currentPlanId, isLoggedIn, earlyBird = [] }: PricingClientProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const router = useRouter();
  const platform = getPaymentPlatform();
  const tiers = groupByTier(plans);

  const earlyBirdMonthly = earlyBird.find((e) => e.planId === "harmonia_earlybird_monthly");
  const earlyBirdPlan = plans.find((p) => p.id === "harmonia_earlybird_monthly");
  const showEarlyBird = earlyBirdMonthly && !earlyBirdMonthly.isSoldOut && earlyBirdPlan;

  const isPaidUser =
    currentPlanId.startsWith("premium") ||
    currentPlanId.startsWith("elite") ||
    currentPlanId.startsWith("harmonia");

  async function handleSubscribe(plan: Plan) {
    if (!isLoggedIn) {
      router.push("/signup");
      return;
    }

    if (plan.id === "free") return;

    setLoading(plan.id);

    // Apple In-App Purchase flow — only triggered when running inside the
    // native iOS app. The native client (kindar-native/) intercepts this
    // before the PWA paywall is reached and uses RevenueCat directly. If we
    // somehow get here on the PWA with platform='apple_iap', fall back to
    // showing the App Store install prompt.
    if (platform === "apple_iap") {
      alert("Compras Apple estao disponiveis somente dentro do app iOS.");
      setLoading(null);
      return;
    }

    // Stripe Checkout flow
    if (!plan.stripePriceId) {
      alert("Plano ainda nao configurado. Entre em contato com o suporte.");
      setLoading(null);
      return;
    }

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

  async function handleRestorePurchases() {
    // Restore Apple purchases is now handled inside the native iOS app
    // (kindar-native/src/services/iap.ts → Purchases.restorePurchases()).
    // From the PWA there's nothing to restore — point the user at the
    // native app instead.
    alert(
      "A restauracao de compras Apple acontece dentro do app iOS Kindar. Abra o app e va em Perfil > Restaurar Compras."
    );
  }

  async function handleManage() {
    // Apple subscriptions are managed via App Store
    if (platform === "apple_iap") {
      globalThis.location.assign("https://apps.apple.com/account/subscriptions");
      return;
    }

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

      {/* Early Bird highlight — only visible while slots remain */}
      {showEarlyBird && earlyBirdPlan && earlyBirdMonthly && (
        <div className="max-w-5xl mx-auto px-4 mb-8">
          <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-16" />
            <div className="relative">
              <div className="inline-block bg-white/25 backdrop-blur text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3">
                Preco de lancamento
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold mb-2">Harmonia Early Bird</h2>
              <p className="text-white/90 text-sm sm:text-base mb-4 max-w-xl">
                R$ 19,90/mes <strong>para sempre</strong> — apenas para as primeiras {earlyBirdMonthly.maxSubscribers} familias.
                Depois, o plano Harmonia volta a R$ 24,90/mes.
              </p>

              <div className="bg-white/20 backdrop-blur rounded-full h-2 overflow-hidden mb-2">
                <div
                  className="bg-white h-full transition-all"
                  style={{
                    width: `${Math.round(
                      ((earlyBirdMonthly.maxSubscribers - earlyBirdMonthly.slotsRemaining) /
                        earlyBirdMonthly.maxSubscribers) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs sm:text-sm font-medium text-white/90 mb-5">
                Restam <strong className="text-white">{earlyBirdMonthly.slotsRemaining}</strong> de{" "}
                {earlyBirdMonthly.maxSubscribers} vagas
              </p>

              <button
                onClick={() => handleSubscribe(earlyBirdPlan)}
                disabled={loading === earlyBirdPlan.id}
                className="inline-flex items-center justify-center bg-white text-emerald-700 font-bold px-6 py-3 rounded-xl hover:bg-stone-50 transition shadow-lg disabled:opacity-70"
              >
                {loading === earlyBirdPlan.id ? "Abrindo…" : "Garantir R$19,90 para sempre"}
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

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

            const isFree = tier.name === "Gratis";
            const isPremium = tier.name === "Harmonia";
            const isElite = tier.name === "Premium Juridico";
            // Match current plan by tier (not exact ID) so toggling billing cycle still shows "Plano atual"
            const currentTier =
              currentPlanId.startsWith("premium_juridico") || currentPlanId.startsWith("elite")
                ? "Premium Juridico"
                : currentPlanId.startsWith("harmonia") || currentPlanId.startsWith("premium")
                  ? "Harmonia"
                  : "Gratis";
            const isCurrent = tier.name === currentTier;

            const priceDisplay = isFree
              ? "R$ 0"
              : `R$ ${(activePlan.priceBrl / 100).toFixed(2).replace(".", ",")}`;

            const intervalLabel = isFree ? "" : billingCycle === "annual" ? "/ano" : "/mes";

            // Calculate monthly equivalent for annual
            const monthlyEquiv = billingCycle === "annual" && !isFree
              ? `R$ ${(activePlan.priceBrl / 100 / 12).toFixed(2).replace(".", ",")}/mes`
              : null;

            // Savings text (annual plans save 20% vs. 12× monthly)
            const savingsText = billingCycle === "annual" && isPremium
              ? "Economize R$ 59,80"
              : billingCycle === "annual" && isElite
                ? "Economize R$ 95,80"
                : null;

            // Feature list for display (curated, not raw)
            const displayFeatures = isFree
              ? ["1 crianca", "30 dias de historico", "Calendario basico", "Despesas basicas", "Guarda basica"]
              : isPremium
                ? ["Criancas ilimitadas", "Convidados ilimitados gratis (avos, babas, advogados)", "Calendario completo", "Despesas ilimitadas", "Chat da familia", "Guarda completa + trocas", "Assistente IA Kindar", "Saude + OCR de receitas", "Suporte prioritario"]
                : ["Tudo do Harmonia, mais:", "Export legal (PDF audit trail)", "Backup juridico automatico", "Relatorios detalhados", "Alertas de receita", "Suporte VIP"];

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
                        {loading === "manage" ? "Abrindo..." : activePlan.id !== currentPlanId ? "Trocar para " + (billingCycle === "annual" ? "anual" : "mensal") : "Gerenciar assinatura"}
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

        {/* Apple IAP: Restore purchases button */}
        {platform === "apple_iap" && isLoggedIn && (
          <div className="flex justify-center mt-8">
            <button
              onClick={handleRestorePurchases}
              disabled={loading === "restore"}
              className="text-sm text-[#C07055] font-medium hover:underline disabled:opacity-50"
            >
              {loading === "restore" ? "Restaurando..." : "Restaurar compras anteriores"}
            </button>
          </div>
        )}

        {/* Trust signals */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10 text-xs text-[#9A8878]">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            {platform === "apple_iap" ? "Pagamento seguro via App Store" : "Pagamento seguro via Stripe"}
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

        {/* Auto-renewal disclosure — required by Apple App Store Review Guideline 3.1.2(c) */}
        <div className="mt-8 text-center text-[11px] text-[#9A8878] max-w-lg mx-auto leading-relaxed">
          <p>
            Assinatura autorrenovavel. Apos o periodo de teste gratuito de 14 dias, a assinatura sera cobrada automaticamente
            no valor do plano selecionado. A assinatura e renovada automaticamente ao final de cada periodo, salvo
            cancelamento pelo menos 24 horas antes do fim do periodo vigente.
            {platform === "apple_iap"
              ? " O pagamento sera cobrado na sua conta Apple ID. Gerencie ou cancele em Ajustes > Apple ID > Assinaturas."
              : " Gerencie ou cancele a qualquer momento nas configuracoes da sua conta."}
          </p>
          <p className="mt-2">
            <Link href="/termos" className="text-[#C07055] hover:underline">Termos de Uso</Link>
            {" \u00b7 "}
            <Link href="/privacidade" className="text-[#C07055] hover:underline">Politica de Privacidade</Link>
            {platform === "apple_iap" && (
              <>
                {" \u00b7 "}
                <a
                  href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#C07055] hover:underline"
                >
                  EULA Apple
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
