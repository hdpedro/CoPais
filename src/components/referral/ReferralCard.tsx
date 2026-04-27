"use client";

import { useState } from "react";
import { buildReferralUrl } from "@/lib/referral";
import { trackEvent, EVENTS } from "@/lib/analytics";

interface Props {
  code: string;
  totalClicks: number;
  totalSignups: number;
  totalRewards: number;
  monthsEarned: number;
}

/**
 * "Indique e ganhe" card — shown in /perfil. Mission-critical widget
 * because each reward creates 2 paying families from 1.
 */
export default function ReferralCard({
  code,
  totalClicks,
  totalSignups,
  totalRewards,
  monthsEarned,
}: Props) {
  const url = buildReferralUrl(code);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      trackEvent(EVENTS.REFERRAL_LINK_COPIED, { code });
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt("Copie este link:", url);
    }
  }

  function shareWhatsApp() {
    trackEvent(EVENTS.REFERRAL_LINK_SHARED, { code, channel: "whatsapp" });
    const msg = `Olha só esse app de organização familiar: ${url}\n\nSe você assinar pelo meu link, ganhamos 1 mês grátis juntos 💛`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function shareGeneric() {
    if (navigator.share) {
      trackEvent(EVENTS.REFERRAL_LINK_SHARED, { code, channel: "native_share" });
      navigator
        .share({
          title: "Kindar — organização da família",
          text: "Testa o Kindar! Se você assinar pelo meu link, ganhamos 1 mês grátis.",
          url,
        })
        .catch(() => {});
    } else {
      copyLink();
    }
  }

  return (
    <section className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">🎁</span>
        <h2 className="text-lg font-bold text-stone-900">Indique e ganhe 1 mês grátis</h2>
      </div>
      <p className="text-sm text-stone-700 mb-5">
        Para cada amigo que assinar pelo seu link, vocês dois ganham <strong>1 mês grátis</strong>. Sem limite.
      </p>

      {/* Link box */}
      <div className="bg-white rounded-xl border border-stone-200 p-3 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Seu link</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono text-stone-900 truncate">{url}</code>
          <button
            onClick={copyLink}
            className="shrink-0 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
          >
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>

      {/* Share buttons */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={shareWhatsApp}
          className="flex-1 bg-[#25D366] hover:bg-[#1EBF5A] text-white font-semibold py-2.5 rounded-xl text-sm"
        >
          💬 WhatsApp
        </button>
        <button
          onClick={shareGeneric}
          className="flex-1 bg-stone-900 hover:bg-stone-800 text-white font-semibold py-2.5 rounded-xl text-sm"
        >
          Compartilhar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 border-t border-emerald-200 pt-4">
        <StatBlock label="Cliques" value={totalClicks} />
        <StatBlock label="Cadastros" value={totalSignups} />
        <StatBlock label="Convertidos" value={totalRewards} />
        <StatBlock label="Meses grátis" value={monthsEarned} highlight />
      </div>

      <p className="text-xs text-stone-500 mt-4 text-center">
        Código: <code className="font-mono font-semibold text-stone-700">{code}</code>
      </p>
    </section>
  );
}

function StatBlock({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${highlight ? "text-emerald-700" : "text-stone-900"}`}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-stone-500 mt-0.5">{label}</p>
    </div>
  );
}
