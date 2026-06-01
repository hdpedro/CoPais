"use client";

/* i18n-ignore-block-start
 *
 * PaywallScreen — copy financeira/legal (preço, auto-renovação, consentimento
 * LGPD de cobrança recorrente). Pela Regra Canônica 14, copy financeira/legal
 * é pt-BR autoritativa e só é traduzida após revisão jurídica por locale.
 * Mesmo tratamento do AssinaturaClient.
 */

import { useState } from "react";
import { signOut } from "@/actions/auth";
import { trackEvent, EVENTS } from "@/lib/analytics";

interface Props {
  groupId: string;
  viewerName: string | null;
}

const HARMONIA_MONTHLY = "harmonia_monthly";

/**
 * Tela de bloqueio total exibida quando o período de 30 dias terminou e o
 * grupo (coorte nova) não tem assinatura ativa. Substitui o app inteiro: as
 * únicas saídas são assinar o Harmonia, ver os planos, falar com o suporte
 * ou sair da conta. Sem botão de fechar — é um gate, não um modal.
 */
export default function PaywallScreen({ groupId, viewerName }: Props) {
  const [busy, setBusy] = useState(false);
  const [recurringConsent, setRecurringConsent] = useState(false);
  const firstName = viewerName?.split(" ")[0] || null;

  async function startCheckout() {
    if (!recurringConsent || busy) return;
    setBusy(true);
    trackEvent(EVENTS.CHECKOUT_STARTED, {
      plan_id: HARMONIA_MONTHLY,
      payment_method: "card",
      source: "paywall_lock",
      recurring_consent: true,
    });
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: HARMONIA_MONTHLY,
          paymentMethod: "card",
          recurringConsent: true,
          groupId,
        }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
      else throw new Error("no_url");
    } catch (e) {
      console.error(e);
      alert("Não foi possível iniciar o checkout. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#EEECEA]">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kindar-logo.png" alt="" width={32} height={32} className="object-contain" />
          <span className="text-2xl font-bold text-[#2C2C2C] tracking-tight">Kindar</span>
        </div>

        <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-7">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 mb-4">
            Período gratuito encerrado
          </span>
          <h1 className="text-2xl font-bold text-stone-900 leading-snug">
            {firstName ? `${firstName}, seu acesso foi pausado` : "Seu acesso foi pausado"}
          </h1>
          <p className="text-stone-600 mt-2 leading-relaxed">
            Seus 30 dias gratuitos terminaram. Assine o <strong>Harmonia</strong> para
            continuar organizando a rotina de quem você cuida — sem perder nenhum dado.
          </p>

          {/* Card Harmonia (plano único) */}
          <div className="mt-6 rounded-2xl border-2 border-[#C07055] p-5">
            <h2 className="text-xl font-bold text-stone-900">Harmonia</h2>
            <p className="text-stone-600 text-sm">Organização completa para toda a família.</p>
            <p className="text-3xl font-extrabold text-stone-900 mt-3">
              R$ 19,90
              <span className="text-base font-normal text-stone-500"> /mês</span>
            </p>
            <ul className="text-sm text-stone-600 my-4 space-y-1.5">
              <li>✓ Crianças ilimitadas</li>
              <li>✓ IA assistente + OCR de receitas</li>
              <li>✓ Saúde completa</li>
              <li>✓ Convidados ilimitados (avós, babá, advogado)</li>
            </ul>

            {/* LGPD Art. 8 — consentimento específico de cobrança recorrente. */}
            <label className="flex items-start gap-3 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={recurringConsent}
                onChange={(e) => setRecurringConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-stone-300 text-[#C07055] focus:ring-[#C07055] cursor-pointer"
              />
              <span className="text-xs text-stone-600 leading-snug">
                Autorizo a cobrança automática e recorrente do plano, renovada a cada ciclo
                até que eu cancele. Posso cancelar quando quiser. Estou ciente dos{" "}
                <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-[#C07055] underline">
                  Termos
                </a>{" "}
                e da{" "}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-[#C07055] underline">
                  Privacidade
                </a>
                .
              </span>
            </label>

            <button
              onClick={startCheckout}
              disabled={busy || !recurringConsent}
              className="w-full bg-[#C07055] hover:bg-[#A85D47] text-white font-semibold py-3.5 rounded-xl shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "Abrindo checkout…" : "Assinar Harmonia"}
            </button>

            <a
              href="/pricing"
              className="block text-center text-sm text-[#C07055] font-medium mt-3 hover:underline"
            >
              Prefere pagar 1× por ano? Ver plano anual (5% off) →
            </a>
          </div>
        </div>

        {/* Saídas: suporte (LGPD/ajuda) + sair da conta */}
        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          <a href="/suporte" className="text-stone-500 hover:text-stone-700">
            Precisa de ajuda ou quer encerrar sua conta? Fale com o suporte
          </a>
          <form action={signOut}>
            <button type="submit" className="text-stone-500 hover:text-stone-700 underline">
              Sair da conta
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* i18n-ignore-block-end */
