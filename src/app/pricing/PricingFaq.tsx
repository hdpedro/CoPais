"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "Por que 1 assinatura cobre a família toda?",
    a: "Porque coparentalidade só funciona se ambos os responsáveis estiverem no mesmo app. Se só um pagasse e o outro não pudesse usar, o produto perderia o valor. Em vez de forçar os dois a pagarem (como concorrentes), fizemos diferente: uma assinatura cobre todos os adultos envolvidos. Simples e justo.",
  },
  {
    q: "Avós, babá, mediador, advogado — eles realmente não pagam?",
    a: "Nunca. Eles são convidados permanentes. Acessam tudo que o plano da família ativa. A lógica: eles não são pagantes — são multiplicadores. Uma avó que aprende Kindar ensina pro filho dela. Um advogado que usa nos processos indica pra clientes.",
  },
  {
    q: "E se eu assinar e meu ex-parceiro não quiser pagar?",
    a: "Ele(a) entra de graça como co-responsável. Você paga uma vez, toda a família acessa. Se preferir, ative o 'split automático' na tela de assinatura: criamos uma despesa recorrente de 50% do valor no módulo de Despesas para ele(a). Resolver o rateio é decisão da família — a gente só dá a ferramenta.",
  },
  {
    q: "O Early Bird realmente fica R$19,90 para sempre?",
    a: "Sim, para sempre. Os primeiros 1.000 assinantes travam o preço no valor de lançamento. Mesmo em 2030, mesmo quando o plano padrão for R$40, R$50. Sua assinatura não sobe. É o tipo de compromisso que a gente assume porque os primeiros clientes são quem valida o produto.",
  },
  {
    q: "O que acontece quando as 1.000 vagas acabarem?",
    a: "Quem já entrou: preço travado. Novos assinantes: começam em R$19,90/mês. O contador na página mostra ao vivo quantas vagas restam.",
  },
  {
    q: "Posso trocar de plano depois?",
    a: "Sim, a qualquer momento. Upgrade vale imediatamente e você paga proporcional. Downgrade vale na próxima renovação (você continua com o plano atual até o período pago terminar).",
  },
  {
    q: "Como o Premium Jurídico é diferente do Harmonia?",
    a: "Pense nele como Harmonia + 'eu tenho um processo rolando'. Ganha: export de tudo em PDF com audit trail (válido em processo), backup jurídico automático, alertas inteligentes nas receitas (detecta alergias cruzadas com histórico), suporte VIP. Se você não tem processo e não prevê ter, Harmonia basta.",
  },
  {
    q: "PIX funciona mensal? Ou só anual?",
    a: "Estamos ativando PIX Automático (recorrência mensal via PIX). Se o seu cartão for estrangeiro ou não tiver crédito, PIX é a melhor escolha — R$5 mais barato que o cartão. Anual via PIX tem o mesmo preço do anual normal.",
  },
  {
    q: "Já tenho 2 grupos familiares (família antiga + nova). Preciso de 2 assinaturas?",
    a: "Sim, uma por grupo familiar. Mas cada grupo vira um grupo totalmente independente — calendário, despesas, saúde tudo separado. Você pode ter múltiplos grupos na mesma conta, com plano diferente em cada.",
  },
  {
    q: "E se meu filho crescer e não precisar mais? Cancelo fácil?",
    a: "Em um clique: /assinatura > Gerenciar > Cancelar. Sem ligação, sem chat de retenção. Você mantém acesso até o fim do período já pago, depois cai para o plano Grátis (pode voltar a usar se quiser).",
  },
];

export default function PricingFaq() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section className="max-w-3xl mx-auto px-4 pb-20">
      <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 mb-10 text-center tracking-tight">
        Dúvidas frequentes
      </h2>
      <div className="space-y-3">
        {FAQS.map((item, idx) => {
          const open = openIdx === idx;
          return (
            <div
              key={item.q}
              className={`rounded-xl border bg-white transition-all ${
                open ? "border-[#C07055]/40 shadow-md" : "border-stone-200 hover:border-stone-300 hover:shadow-sm"
              }`}
            >
              <button
                onClick={() => setOpenIdx(open ? null : idx)}
                aria-expanded={open}
                className="w-full flex items-start justify-between gap-4 p-5 text-left cursor-pointer hover:bg-stone-50/60 rounded-xl transition-colors"
              >
                <span className="text-[15px] sm:text-base font-semibold text-stone-900 leading-snug">
                  {item.q}
                </span>
                <span
                  className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#C07055]/10 text-[#C07055] text-xl font-light transition-transform ${
                    open ? "rotate-45 bg-[#C07055] text-white" : ""
                  }`}
                  aria-hidden="true"
                >
                  +
                </span>
              </button>
              {open && (
                <div className="px-5 pb-5 text-[14.5px] text-stone-600 leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
