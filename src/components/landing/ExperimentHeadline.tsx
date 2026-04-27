"use client";

import { useEffect, useState } from "react";
import { getExperimentVariant } from "@/lib/experiments";
import { EXPERIMENTS } from "@/lib/experiments";

interface Props {
  earlyBirdRemaining?: number;
}

/**
 * Experiment: LANDING_HEADLINE — tests three H1 variants.
 *
 * SSR renders the control so SEO + initial paint are both correct. After
 * hydration, we call PostHog to bucket the user and swap to their variant.
 * Worst case (PostHog slow / blocked) the user sees the control forever
 * and we fail open — no broken state possible.
 */
export default function ExperimentHeadline({ earlyBirdRemaining }: Props) {
  const [variant, setVariant] = useState<string>("control");

  useEffect(() => {
    // SSR renders control so SEO + initial paint match across all variants;
    // post-hydration we ask PostHog which bucket this user is in and
    // re-render. The cascading-render warning doesn't apply here — this
    // is a one-shot bridge between SSR HTML and the PostHog client cache.
    // Worst case: user sees control for ~50ms before flipping.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVariant(getExperimentVariant(EXPERIMENTS.LANDING_HEADLINE));
  }, []);

  return (
    <>
      <h1 className="text-[2.5rem] sm:text-[3.5rem] lg:text-[4rem] font-extrabold leading-[1.1] tracking-tight">
        {variant === "family" ? (
          <>
            Uma assinatura.{" "}
            <span className="text-[#C07055]">Família toda acessa.</span>
          </>
        ) : variant === "early" && earlyBirdRemaining !== undefined && earlyBirdRemaining > 0 ? (
          <>
            Últimas vagas a{" "}
            <span className="text-[#C07055]">R$ 19,90/mês para sempre</span>
          </>
        ) : (
          <>
            A rotina da criança,{" "}
            <span className="text-[#C07055]">organizada em um só lugar</span>
          </>
        )}
      </h1>
      <p className="mt-6 text-lg sm:text-xl text-[#6B6560] max-w-2xl mx-auto leading-relaxed">
        {variant === "family"
          ? "Co-responsável, avós, babá, advogado, mediador — todos acessam grátis. Só os responsáveis legais pagam."
          : variant === "early" && earlyBirdRemaining !== undefined && earlyBirdRemaining > 0
            ? `Apenas as primeiras 1.000 famílias. Restam ${earlyBirdRemaining} vagas a R$19,90/mês para sempre.`
            : "Calendário, saúde, escola, atividades, guarda compartilhada e comunicação entre responsáveis — tudo centralizado para quem cuida."}
      </p>
    </>
  );
}
