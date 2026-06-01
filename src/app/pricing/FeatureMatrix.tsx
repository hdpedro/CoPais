/**
 * "Tudo o que vem no Harmonia" — modelo de plano único (jun/2026).
 * O Harmonia libera o app inteiro; não há mais comparação entre planos
 * (Grátis/Early Bird/Premium Jurídico saíram). Pagou = tudo liberado, então
 * as features antes exclusivas do Jurídico (export legal, audit trail,
 * alertas, suporte prioritário) também entram aqui.
 * Server-rendered, sem JS no cliente.
 */
import { trialDaysInAppPublic } from "@/lib/billing/promo";

const FEATURES: string[] = [
  "Crianças ilimitadas no grupo",
  "Convidados grátis ilimitados (avós, babá, advogado, mediador)",
  "Histórico de dados ilimitado",
  "Calendário + agenda de guarda completos",
  "Despesas compartilhadas com split e acertos",
  "Chat da família com IA mediadora",
  "Saúde completa (consultas, vacinas, medicamentos)",
  "OCR de receita médica + inferência clínica",
  "Assistente de IA Kindar (no app e no WhatsApp)",
  "Sincroniza iOS + Android + Web",
  "Export legal em PDF com audit trail",
  "Backup jurídico automático",
  "Alertas inteligentes de receita (alergia cruzada, interação)",
  "Suporte prioritário",
  "Indique e ganhe (1 mês grátis por amigo)",
];

export default function FeatureMatrix() {
  const trialDays = trialDaysInAppPublic();
  return (
    <section className="max-w-4xl mx-auto px-4 pb-16">
      <h2 className="text-2xl font-bold text-stone-900 mb-2 text-center">
        Tudo o que vem no Harmonia
      </h2>
      <p className="text-center text-sm text-stone-500 mb-8">
        Uma assinatura, a família inteira acessa. Sem nenhum recurso travado atrás de plano.
      </p>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 sm:p-8">
        <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3.5">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-3">
              <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-sm text-stone-700">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center text-xs text-stone-500 mt-4">
        Comece com {trialDays} dias grátis, com tudo liberado. Cancele quando quiser, sem multa.
      </p>
    </section>
  );
}
