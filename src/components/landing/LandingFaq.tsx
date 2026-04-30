"use client";

import { useState } from "react";
import { trackEvent, EVENTS } from "@/lib/analytics";

interface FaqItem {
  q: string;
  a: React.ReactNode;
}

const FAQS: FaqItem[] = [
  {
    q: "O Kindar é só para pais separados?",
    a: "Não. O Kindar organiza a rotina de qualquer família — nucleares, separadas, homoafetivas, monoparentais, famílias onde os avós cuidam, tutores, cuidadores. As features de guarda compartilhada aparecem progressivamente quando fazem sentido.",
  },
  {
    q: "Quem precisa pagar? Meus pais, babá e advogado também?",
    a: "Não. Apenas os responsáveis legais (pai, mãe ou tutor com guarda) assinam. Avós, babás, mediadores e advogados entram de graça como convidados, com acesso completo ao plano da família.",
  },
  {
    q: "O que é o Early Bird? O preço sobe mesmo?",
    a: "Sim. As primeiras 1.000 famílias pagam R$ 14,90/mês para sempre — mesmo quando o preço padrão subir para R$ 19,90. Uma vez assinado, seu preço nunca muda. O contador na página mostra quantas vagas ainda restam.",
  },
  {
    q: "Como funciona a degustação de 7 dias?",
    a: "Quando você cria sua conta, automaticamente recebe 7 dias do plano Premium Jurídico — o maior — sem pagar e sem cadastrar cartão. Ao fim dos 7 dias, você escolhe um plano ou cai para o Grátis (com limites). Ninguém é cobrado sem avisar.",
  },
  {
    q: "Posso dividir o custo com meu co-responsável?",
    a: "Sim, com um clique. Depois de assinar, ative o split no /assinatura — criamos uma despesa recorrente de 50% no nosso módulo de Despesas, com notificação automática. Zero fricção para rachar.",
  },
  {
    q: "Funciona no iPhone, Android e computador?",
    a: "Sim, nos três. App iOS na App Store, Android no Google Play, e versão web em kindar.com.br. Sua assinatura funciona em todas automaticamente — pagou em um, funciona nos outros.",
  },
  {
    q: "Como cancelo?",
    a: "No próprio app em /assinatura (botão 'Gerenciar'). Para assinaturas iOS, via Ajustes > Apple ID > Assinaturas. Android, via Google Play > Assinaturas. Sem fidelidade, sem burocracia.",
  },
  {
    q: "Meus dados estão seguros? E a LGPD?",
    a: "Sim. Backend na Supabase com Row Level Security em todas as tabelas. LGPD compliance: consentimento registrado, exportação e exclusão via /perfil. Chat imutável por conformidade legal — serve como prova documental se precisar.",
  },
];

export default function LandingFaq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="py-20 sm:py-24 px-5 sm:px-8 bg-[#FAFAF8]" id="faq">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold leading-tight">Perguntas frequentes</h2>
          <p className="mt-3 text-[#6B6560]">Resposta rápida para as dúvidas mais comuns.</p>
        </div>

        <div className="space-y-2">
          {FAQS.map((item, idx) => {
            const open = openIdx === idx;
            return (
              <div
                key={item.q}
                className={`rounded-2xl border bg-white transition ${
                  open ? "border-[#C07055]/30 shadow-sm" : "border-black/[0.06]"
                }`}
              >
                <button
                  onClick={() => {
                    const next = open ? null : idx;
                    setOpenIdx(next);
                    if (next !== null) {
                      trackEvent(EVENTS.LANDING_VIEWED, { faq_opened: item.q });
                    }
                  }}
                  className="w-full flex items-start justify-between gap-4 p-5 text-left"
                >
                  <span className="text-[15px] font-semibold text-[#0E0C0A]">{item.q}</span>
                  <span
                    className={`shrink-0 text-[#C07055] text-xl transition-transform ${
                      open ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                {open && (
                  <div className="px-5 pb-5 text-[14px] text-[#6B6560] leading-relaxed">{item.a}</div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-[#9A8878] mt-10">
          Outra dúvida? Escreva pra gente em{" "}
          <a href="mailto:contato@kindar.com.br" className="text-[#C07055] hover:underline">
            contato@kindar.com.br
          </a>
          .
        </p>
      </div>
    </section>
  );
}
