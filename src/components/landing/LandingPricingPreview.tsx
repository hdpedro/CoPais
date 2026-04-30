import Link from "next/link";

interface Props {
  earlyBirdRemaining?: number;
  earlyBirdMax?: number;
}

/**
 * Pricing preview on the landing — not the full pricing page, just
 * enough to lock in the Early Bird offer and anchor the "R$19,90/mês
 * pela família inteira" value prop. Direct CTA to /signup (with the
 * Early Bird plan pre-selected via ?plan= param).
 */
export default function LandingPricingPreview({
  earlyBirdRemaining = 0,
  earlyBirdMax = 1000,
}: Props) {
  const hasEarlyBird = earlyBirdRemaining > 0;
  const claimedPct = Math.round(((earlyBirdMax - earlyBirdRemaining) / earlyBirdMax) * 100);

  return (
    <section className="py-20 sm:py-28 px-5 sm:px-8 bg-[#FAFAF8]" id="planos">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#C07055] mb-3">
            Assine uma vez. Família toda acessa.
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
            Três planos. Um só para a <span className="text-[#C07055]">família inteira</span>.
          </h2>
          <p className="mt-4 text-lg text-[#6B6560] max-w-2xl mx-auto">
            Co-responsáveis, avós, babás, advogados e mediadores entram grátis. Só responsáveis legais pagam.
          </p>
        </div>

        {/* Early Bird mega-card */}
        {hasEarlyBird && (
          <div className="relative bg-gradient-to-br from-[#2E7268] to-[#1F524B] rounded-3xl p-8 sm:p-10 text-white shadow-2xl overflow-hidden mb-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-24 translate-x-24" />
            <div className="relative grid md:grid-cols-2 gap-6 items-center">
              <div>
                <div className="inline-block bg-white/20 backdrop-blur text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
                  🎯 Preço de lançamento · para sempre
                </div>
                <h3 className="text-3xl sm:text-4xl font-extrabold leading-tight mb-2">
                  R$ 14,90
                  <span className="text-lg font-medium opacity-90"> /mês para sempre</span>
                </h3>
                <p className="text-white/90 mb-5">
                  Apenas para as primeiras {earlyBirdMax.toLocaleString("pt-BR")} famílias.
                  Depois, o Harmonia volta a R$ 19,90.
                </p>

                <div className="bg-white/20 rounded-full h-2 overflow-hidden mb-2">
                  <div
                    className="bg-white h-full transition-all"
                    style={{ width: `${claimedPct}%` }}
                  />
                </div>
                <p className="text-sm font-medium mb-6">
                  Restam <strong>{earlyBirdRemaining.toLocaleString("pt-BR")}</strong> de{" "}
                  {earlyBirdMax.toLocaleString("pt-BR")} vagas
                </p>

                <Link
                  href="/signup"
                  className="inline-flex items-center bg-white text-[#2E7268] font-bold px-6 py-3.5 rounded-xl hover:bg-stone-50 transition shadow-lg"
                >
                  Garantir R$ 14,90/mês →
                </Link>
              </div>

              <ul className="space-y-3 text-[15px]">
                {[
                  "Crianças ilimitadas",
                  "Calendário de guarda + trocas",
                  "IA Kindar assistente",
                  "OCR de receita médica",
                  "Saúde completa + inferência clínica",
                  "Despesas, split e acertos",
                  "Convidados ilimitados (avós, babá, advogado)",
                  process.env.NEXT_PUBLIC_PROMO_2M_FREE === "true"
                    ? "🎁 2 meses de Premium Jurídico grátis no signup"
                    : "7 dias de Premium Jurídico no signup",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-white mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Other plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h3 className="text-lg font-bold text-[#0E0C0A]">Harmonia</h3>
            <p className="text-sm text-[#6B6560] mt-1">Organização completa para toda a família</p>
            <p className="mt-4 text-3xl font-extrabold text-[#0E0C0A]">
              R$ 19,90<span className="text-sm font-medium text-[#9A8878]">/mês</span>
            </p>
            <p className="text-xs text-[#9A8878] mt-1">ou R$ 199,90/ano (~16% off)</p>
            <p className="text-[13px] text-[#6B6560] mt-4 mb-5">
              Mesma lista do Early Bird, mas preço padrão — ideal para quem entrou depois das primeiras 1.000 vagas.
            </p>
            <Link
              href="/signup"
              className="block text-center bg-[#0E0C0A] text-white font-semibold py-3 rounded-xl hover:bg-stone-800 transition"
            >
              Começar grátis
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-amber-300 p-6">
            <div className="inline-block bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-1 rounded mb-2">
              Para processos ativos
            </div>
            <h3 className="text-lg font-bold text-[#0E0C0A]">Premium Jurídico</h3>
            <p className="text-sm text-[#6B6560] mt-1">Tudo do Harmonia + suporte jurídico</p>
            <p className="mt-4 text-3xl font-extrabold text-[#0E0C0A]">
              R$ 39,90<span className="text-sm font-medium text-[#9A8878]">/mês</span>
            </p>
            <p className="text-xs text-[#9A8878] mt-1">ou R$ 383/ano (20% off)</p>
            <p className="text-[13px] text-[#6B6560] mt-4 mb-5">
              Export legal PDF com audit trail · backup jurídico · alertas inteligentes de receita · suporte VIP.
            </p>
            <Link
              href="/signup"
              className="block text-center bg-amber-600 text-white font-semibold py-3 rounded-xl hover:bg-amber-700 transition"
            >
              Assinar Premium Jurídico
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-[#9A8878] mt-8">
          7 dias de degustação Premium Jurídico no signup. Sem cartão. Você decide depois.
        </p>
        <div className="text-center mt-2">
          <Link href="/pricing" className="text-sm text-[#C07055] hover:underline">
            Comparar planos detalhadamente →
          </Link>
        </div>
      </div>
    </section>
  );
}
