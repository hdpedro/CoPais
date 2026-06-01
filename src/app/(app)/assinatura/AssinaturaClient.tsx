"use client";

/* i18n-ignore-block-start
 *
 * AssinaturaClient — copy financeira completa (preços, promoções, refund
 * policy, ToS de cobrança). Regra Canônica 14 obriga revisão jurídica +
 * marketing antes de qualquer tradução. PT-BR é a fonte autorizada.
 *
 * Quando localização for aprovada (Tier 2 — pós tradução jurídica), remover
 * este bloco e migrar cada string pra `t("subscriptionPage.X")` via add-keys
 * --target=both, com revisão humana de cada locale por advogado regional
 * (LGPD-BR vs GDPR-EU vs CCPA-US etc.).
 */

import { useState, useTransition } from "react";
import type { PlanTier } from "@/lib/billing";
import { enableSubscriptionSplit, disableSubscriptionSplit } from "@/actions/subscription-split";
import { trackEvent, EVENTS } from "@/lib/analytics";

const PIX_ENABLED = process.env.NEXT_PUBLIC_PIX_ENABLED === "true";
const PROMO_2M_FREE = process.env.NEXT_PUBLIC_PROMO_2M_FREE === "true";

interface SubscriptionView {
  subscriptionId: string;
  planId: string;
  tier: PlanTier;
  status: string;
  isActive: boolean;
  isTrial: boolean;
  trialEnd: string | null;
  trialDaysRemaining: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface EarlyBirdView {
  slotsRemaining: number;
  maxSubscribers: number;
  isSoldOut: boolean;
}

interface CoCandidate {
  userId: string;
  fullName: string;
}

interface SplitState {
  enabled: boolean;
  coUserId: string | null;
  coSharePercent: number;
  coShareAmount: number;
}

interface Props {
  subscription: SubscriptionView;
  groupId: string;
  canPay: boolean;
  payerReason?: string;
  payerName: string | null;
  viewerName: string | null;
  earlyBird: EarlyBirdView;
  coCandidates?: CoCandidate[];
  splitState?: SplitState;
}

const tierLabels: Record<PlanTier, string> = {
  free: "Grátis",
  harmonia: "Harmonia",
  premium_juridico: "Premium Jurídico",
};

const tierBadgeColor: Record<PlanTier, string> = {
  free: "bg-stone-100 text-stone-700",
  harmonia: "bg-emerald-100 text-emerald-800",
  premium_juridico: "bg-amber-100 text-amber-800",
};

export default function AssinaturaClient({
  subscription,
  groupId,
  canPay,
  payerReason,
  payerName,
  coCandidates = [],
  splitState,
}: Props) {
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix">(
    PIX_ENABLED ? "pix" : "card"
  );
  const [couponInput, setCouponInput] = useState("");
  const [couponStatus, setCouponStatus] = useState<
    | { kind: "idle" }
    | { kind: "validating" }
    | { kind: "valid"; code: string; description: string | null; label: string }
    | { kind: "invalid"; error: string }
  >({ kind: "idle" });
  const [splitCoUserId, setSplitCoUserId] = useState<string>(
    splitState?.coUserId ?? coCandidates[0]?.userId ?? ""
  );
  const [splitCoShare, setSplitCoShare] = useState<number>(splitState?.coSharePercent ?? 50);
  const [splitPending, startSplitTransition] = useTransition();
  const [splitMessage, setSplitMessage] = useState<string | null>(null);
  // LGPD Art. 8 (consentimento livre, informado e inequívoco) — ANPD em
  // outubro/2025 começou a fiscalizar contratos de assinatura recorrente
  // pedindo evidência de consent específico de cobrança automática (separado
  // dos Termos gerais). Checkbox bloqueia o botão até o user marcar.
  const [recurringConsent, setRecurringConsent] = useState(false);

  function handleEnableSplit() {
    if (!splitCoUserId) return;
    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("coUserId", splitCoUserId);
    formData.set("coSharePercent", String(splitCoShare));
    startSplitTransition(async () => {
      setSplitMessage(null);
      const res = await enableSubscriptionSplit(formData);
      if (res.error) setSplitMessage(res.error);
      else setSplitMessage("Divisão ativada — o co-responsável foi avisado.");
    });
  }

  function handleDisableSplit() {
    const formData = new FormData();
    formData.set("groupId", groupId);
    startSplitTransition(async () => {
      setSplitMessage(null);
      const res = await disableSubscriptionSplit(formData);
      if (res.error) setSplitMessage(res.error);
      else setSplitMessage("Divisão desativada. Próximos meses não serão rachados.");
    });
  }

  async function startCheckout(planId: string) {
    if (!recurringConsent) {
      // UI gate — botão é disabled, mas defesa em profundidade.
      return;
    }
    setBusyPlan(planId);
    const couponCode = couponStatus.kind === "valid" ? couponStatus.code : undefined;
    trackEvent(EVENTS.CHECKOUT_STARTED, {
      plan_id: planId,
      payment_method: paymentMethod,
      coupon_code: couponCode || null,
      recurring_consent: true,
    });
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId, paymentMethod, couponCode, recurringConsent: true }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (e) {
      console.error(e);
      alert("Não foi possível iniciar o checkout. Tente novamente.");
      setBusyPlan(null);
    }
  }

  async function validateCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponStatus({ kind: "validating" });
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.valid) {
        trackEvent(EVENTS.COUPON_REJECTED, { code, reason: data.error });
        setCouponStatus({ kind: "invalid", error: data.error || "Código inválido" });
      } else {
        const label = data.amountOffBrl
          ? `R$ ${(data.amountOffBrl / 100).toFixed(2).replace(".", ",")} off`
          : `${data.percentOff}% off`;
        trackEvent(EVENTS.COUPON_APPLIED, { code: data.code, label });
        setCouponStatus({ kind: "valid", code: data.code, description: data.description, label });
      }
    } catch {
      setCouponStatus({ kind: "invalid", error: "Falha ao validar — tente novamente." });
    }
  }

  function clearCoupon() {
    setCouponInput("");
    setCouponStatus({ kind: "idle" });
  }

  const [portalLoading, setPortalLoading] = useState(false);
  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (e) {
      console.error(e);
      alert("Não foi possível abrir o portal de gerenciamento.");
      setPortalLoading(false);
    }
  }

  // Non-payer view — show "your family is on plan X" + who manages it.
  if (!canPay) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-stone-900 mb-2">Assinatura da família</h1>
        <p className="text-stone-600 mb-6">
          Apenas responsáveis legais podem gerenciar a assinatura. Você tem acesso
          completo ao plano ativo pago pela família.
        </p>

        <div className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${tierBadgeColor[subscription.tier]}`}>
              {tierLabels[subscription.tier]}
            </span>
            {subscription.isTrial && (
              <span className="text-xs text-emerald-700 font-medium">
                Degustação · {subscription.trialDaysRemaining} {subscription.trialDaysRemaining === 1 ? "dia" : "dias"} restantes
              </span>
            )}
          </div>
          <p className="text-stone-700">
            {subscription.isActive
              ? payerName
                ? `Pago por ${payerName}.`
                : "Assinatura ativa pela família."
              : "Nenhuma assinatura ativa — a família está no plano Grátis."}
          </p>
          {payerReason === "not_legal_guardian" && (
            <p className="mt-3 text-xs text-stone-500">
              Seu perfil está como convidado (avô/avó, babá, mediador ou advogado). Essa é uma escolha intencional — você nunca é cobrado.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Payer view — single plan (Harmonia). Early Bird and Premium Jurídico
  // are hidden for new buyers (single-plan model, jun/2026); grandfathered
  // subs keep working server-side.
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-stone-900 mb-2">Assinatura da família</h1>
      <p className="text-stone-600 mb-6">
        Uma assinatura, família inteira acessa. Co-responsáveis, avós, babás, advogados
        e mediadores entram grátis.
      </p>

      {PROMO_2M_FREE && !subscription.isActive && (
        <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="text-2xl shrink-0">🎁</div>
            <div>
              <p className="text-sm font-bold text-amber-900">Promoção de lançamento</p>
              <p className="text-xs text-amber-800 mt-1">
                <strong>2 meses grátis</strong> em qualquer plano pago. Sem fidelidade,
                sem cartão durante o período de teste. Cancele quando quiser.
              </p>
            </div>
          </div>
        </div>
      )}

      {subscription.isActive && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
          <p className="text-sm font-semibold text-emerald-900">
            Plano atual: {tierLabels[subscription.tier]}
            {subscription.isTrial && ` · Degustação (${subscription.trialDaysRemaining} ${subscription.trialDaysRemaining === 1 ? "dia" : "dias"} restantes)`}
          </p>
          {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
            <p className="text-xs text-emerald-800 mt-1">
              Cancelamento agendado para {new Date(subscription.currentPeriodEnd).toLocaleDateString("pt-BR")}
            </p>
          )}
          {/* Stripe customer portal — only when sub is real (not trial) and came from Stripe */}
          {!subscription.isTrial && (
            <button
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="mt-3 text-sm font-semibold text-emerald-800 hover:text-emerald-900 underline disabled:opacity-60"
            >
              {portalLoading ? "Abrindo…" : "Gerenciar cartão · cancelar · ver notas fiscais →"}
            </button>
          )}
        </div>
      )}

      {/* Coupon input — hidden once a valid code is applied so the UI
          doesn't look noisy. Not shown during trial because the user
          isn't at checkout yet. */}
      {!subscription.isTrial && (
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
            Código promocional
          </p>
          {couponStatus.kind === "valid" ? (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <span className="text-sm font-semibold text-emerald-900">
                ✓ {couponStatus.code} · {couponStatus.label}
              </span>
              {couponStatus.description && (
                <span className="text-xs text-emerald-700 hidden sm:inline">— {couponStatus.description}</span>
              )}
              <button
                onClick={clearCoupon}
                className="ml-auto text-xs text-emerald-800 hover:underline"
              >
                Remover
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={couponInput}
                onChange={(e) => {
                  setCouponInput(e.target.value.toUpperCase());
                  if (couponStatus.kind === "invalid") setCouponStatus({ kind: "idle" });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    validateCoupon();
                  }
                }}
                placeholder="Ex: PROFESSORA20"
                className="flex-1 border border-stone-300 rounded-xl px-3 py-2.5 font-mono uppercase placeholder:font-sans placeholder:normal-case"
              />
              <button
                onClick={validateCoupon}
                disabled={!couponInput.trim() || couponStatus.kind === "validating"}
                className="bg-stone-900 text-white font-semibold px-4 rounded-xl disabled:opacity-60"
              >
                {couponStatus.kind === "validating" ? "…" : "Aplicar"}
              </button>
            </div>
          )}
          {couponStatus.kind === "invalid" && (
            <p className="text-xs text-red-700 mt-1">{couponStatus.error}</p>
          )}
        </div>
      )}

      {/* Payment method toggle — only shown if PIX is enabled on the
          Stripe account (NEXT_PUBLIC_PIX_ENABLED=true). Otherwise
          checkout defaults silently to card. */}
      {PIX_ENABLED && !subscription.isTrial && (
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
            Método de pagamento
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("pix")}
              className={`flex-1 py-3 rounded-xl border-2 transition ${
                paymentMethod === "pix"
                  ? "bg-emerald-50 border-emerald-500 text-emerald-900"
                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
              }`}
            >
              <p className="text-sm font-bold">💸 PIX</p>
              <p className="text-xs">Economize R$5/mês</p>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              className={`flex-1 py-3 rounded-xl border-2 transition ${
                paymentMethod === "card"
                  ? "bg-stone-900 border-stone-900 text-white"
                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
              }`}
            >
              <p className="text-sm font-bold">💳 Cartão</p>
              <p className="text-xs">Renovação automática</p>
            </button>
          </div>
        </div>
      )}

      {/* LGPD Art. 8 — consentimento específico, livre e informado para
          cobrança recorrente. Bloqueia todos os botões de assinar até o
          user marcar. Separado dos Termos gerais pra atender exigência da
          ANPD (outubro/2025) de "consent específico" pra modalidades de
          cobrança automática. Não exibimos durante trial ativo — user já
          consentiu se ativou trial via createGroup e não está re-iniciando
          uma assinatura paga. */}
      {!subscription.isActive || subscription.isTrial ? (
        <div className="mb-6 p-4 bg-stone-50 border border-stone-200 rounded-xl">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={recurringConsent}
              onChange={(e) => setRecurringConsent(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              aria-describedby="recurring-consent-text"
            />
            <span id="recurring-consent-text" className="text-sm text-stone-700 leading-snug">
              Autorizo a cobrança automática e recorrente do valor do plano selecionado,
              renovada a cada ciclo até que eu cancele. Posso cancelar a qualquer momento
              no portal do Stripe (no caso de PIX/cartão) ou nas Configurações da Apple/Google
              (no caso de IAP). Estou ciente dos{" "}
              <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">
                Termos de Uso
              </a>{" "}
              e da{" "}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">
                Política de Privacidade
              </a>
              .
            </span>
          </label>
        </div>
      ) : null}

      <div className="space-y-4">
        {/* Harmonia — plano único (R$19,90/mês). */}
        <article className="relative bg-white rounded-2xl border-2 border-[#C07055] p-6 shadow-lg shadow-[#C07055]/15 md:scale-[1.02]">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#C07055] text-white text-xs font-bold rounded-full uppercase tracking-wider whitespace-nowrap">
            Mais popular
          </div>
          <h2 className="text-2xl font-bold text-stone-900 mt-2">Harmonia</h2>
          <p className="text-stone-600 text-sm mb-3">Organização completa para toda a família.</p>
          {paymentMethod === "pix" && PIX_ENABLED ? (
            <>
              <p className="text-4xl font-extrabold text-stone-900 mb-0.5">
                R$ 14,90
                <span className="text-base font-normal text-stone-500"> /mês via PIX</span>
              </p>
              <p className="text-xs text-stone-500 line-through mb-1">R$ 19,90 /mês no cartão</p>
            </>
          ) : (
            <p className="text-4xl font-extrabold text-stone-900 mb-1">
              R$ 19,90
              <span className="text-base font-normal text-stone-500"> /mês</span>
            </p>
          )}
          <ul className="text-sm text-stone-600 my-4 space-y-1.5">
            <li>✓ Crianças ilimitadas</li>
            <li>✓ IA assistente</li>
            <li>✓ OCR de receitas médicas</li>
            <li>✓ Saúde completa</li>
            <li>✓ Convidados ilimitados</li>
          </ul>
          <button
            onClick={() => startCheckout("harmonia_monthly")}
            disabled={busyPlan === "harmonia_monthly" || !recurringConsent}
            className="w-full bg-[#C07055] hover:bg-[#A85D47] text-white font-semibold py-3.5 rounded-xl shadow-md shadow-[#C07055]/30 transition-all hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60 disabled:hover:shadow-md disabled:hover:translate-y-0"
          >
            {busyPlan === "harmonia_monthly" ? "Abrindo checkout…" : "Assinar Harmonia"}
          </button>
        </article>

        {/* Atalho pro plano anual (5% off). /pricing tem o toggle
            Mensal/Anual. Quem está logado vê esse link inline. */}
        <a
          href="/pricing"
          className="block text-center text-sm text-[#C07055] font-medium mt-2 py-3 rounded-xl border border-dashed border-[#C07055]/40 hover:bg-[#C07055]/5 transition-colors"
        >
          Prefere pagar 1× por ano? Economize 5% no plano anual →
        </a>
      </div>

      {/* Split automático — only for active (non-trial) subs with an eligible co-parent */}
      {subscription.isActive && !subscription.isTrial && coCandidates.length > 0 && (
        <section className="mt-8 bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="text-lg font-bold text-stone-900 mb-1">Dividir com co-responsável</h2>
          <p className="text-sm text-stone-600 mb-4">
            Criamos uma despesa recorrente no módulo de Despesas cada mês, com split configurável.
            Zero burocracia — sai direto no balanço da família.
          </p>

          {splitState?.enabled ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-emerald-900 mb-1">
                ✓ Divisão ativa ·{" "}
                {(() => {
                  const coName =
                    coCandidates.find((c) => c.userId === splitState.coUserId)?.fullName ||
                    "co-responsável";
                  return `${coName.split(" ")[0]} paga R$ ${splitState.coShareAmount
                    .toFixed(2)
                    .replace(".", ",")}/mês (${splitState.coSharePercent}%)`;
                })()}
              </p>
              <p className="text-xs text-emerald-800 mb-3">
                Uma despesa é criada automaticamente no módulo de Despesas a cada renovação.
              </p>
              <button
                onClick={handleDisableSplit}
                disabled={splitPending}
                className="text-sm font-semibold text-red-700 hover:text-red-800 disabled:opacity-60"
              >
                {splitPending ? "Desativando…" : "Desativar divisão"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {coCandidates.length === 1 ? (
                <p className="text-sm text-stone-700">
                  Co-responsável: <strong>{coCandidates[0].fullName}</strong>
                </p>
              ) : (
                <label className="block">
                  <span className="text-sm font-semibold text-stone-700">Co-responsável</span>
                  <select
                    value={splitCoUserId}
                    onChange={(e) => setSplitCoUserId(e.target.value)}
                    className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                  >
                    {coCandidates.map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Percentual que ele(a) paga</span>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={5}
                    value={splitCoShare}
                    onChange={(e) => setSplitCoShare(parseInt(e.target.value, 10))}
                    className="flex-1"
                  />
                  <span className="text-sm font-bold text-stone-900 w-12 text-right">
                    {splitCoShare}%
                  </span>
                </div>
              </label>

              <button
                onClick={handleEnableSplit}
                disabled={splitPending || !splitCoUserId}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl disabled:opacity-60"
              >
                {splitPending ? "Ativando divisão…" : "Ativar divisão"}
              </button>
            </div>
          )}

          {splitMessage && (
            <p
              className={`text-sm mt-3 ${
                splitMessage.startsWith("Falha") || splitMessage.includes("erro")
                  ? "text-red-700"
                  : "text-emerald-700"
              }`}
            >
              {splitMessage}
            </p>
          )}
        </section>
      )}

      {subscription.isActive && subscription.isTrial && (
        <p className="text-xs text-stone-500 mt-6 text-center">
          Durante a degustação não há cobrança para dividir. Escolha um plano para habilitar o split com seu co-responsável.
        </p>
      )}

      {!subscription.isActive && (
        <p className="text-xs text-stone-500 mt-6 text-center">
          Depois de assinar, você pode dividir o custo automaticamente com seu co-responsável — split 50/50 (ou customizado) via módulo de Despesas.
        </p>
      )}
    </div>
  );
}

/* i18n-ignore-block-end */
