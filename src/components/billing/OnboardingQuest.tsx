import Link from "next/link";
import type { QuestStep } from "@/actions/onboarding-quest";

interface Props {
  completed: Set<QuestStep>;
  totalSteps: number;
}

interface StepDef {
  id: QuestStep;
  title: string;
  description: string;
  href: string;
  icon: string;
}

const STEPS: StepDef[] = [
  {
    id: "add_child",
    title: "Adicionar uma criança",
    description: "Cadastre nome, idade e foto.",
    href: "/criancas/nova",
    icon: "👶",
  },
  {
    id: "setup_calendar",
    title: "Organizar o calendário",
    description: "Crie uma escala de guarda ou siga sem escala.",
    href: "/calendario/escala",
    icon: "📅",
  },
  {
    id: "invite_co",
    title: "Convidar o co-responsável",
    description: "Manda o link por WhatsApp em segundos.",
    href: "/convite/enviar",
    icon: "✉️",
  },
  {
    id: "ocr_prescription",
    title: "Ler uma receita com IA",
    description: "Tire foto de uma receita médica — a IA faz o resto.",
    href: "/saude/receita",
    icon: "💊",
  },
  {
    id: "ai_agreement",
    title: "Pedir acordo para a IA",
    description: "Peça à IA Kindar para gerar um acordo de rotina.",
    href: "/dashboard?ai=open",
    icon: "🤖",
  },
];

/**
 * Dashboard widget shown during the 7-day trial to drive users toward
 * completing the 5 premium-touching actions. Disappears once all 5 are
 * done (or after trial ends, since parent only renders it in trial).
 */
export default function OnboardingQuest({ completed, totalSteps }: Props) {
  const completedCount = STEPS.filter((s) => completed.has(s.id)).length;
  if (completedCount >= totalSteps) {
    return (
      <section className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="text-sm font-bold text-emerald-900">Você viu tudo que o Kindar faz!</p>
            <p className="text-xs text-emerald-800 mt-0.5">
              Agora é só escolher um plano para manter o acesso quando a degustação acabar.
            </p>
          </div>
          <Link
            href="/assinatura"
            className="ml-auto shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            Ver planos
          </Link>
        </div>
      </section>
    );
  }

  const pct = Math.round((completedCount / totalSteps) * 100);

  return (
    <section className="bg-white border border-stone-200 rounded-2xl p-5 mb-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-stone-900">Veja o Kindar funcionando hoje</h3>
        <span className="text-xs text-stone-600 font-medium">
          {completedCount}/{totalSteps}
        </span>
      </div>
      <div className="bg-stone-100 rounded-full h-2 overflow-hidden mb-4">
        <div
          className="bg-emerald-500 h-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-2">
        {STEPS.map((step) => {
          const done = completed.has(step.id);
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                className={`flex items-center gap-3 p-2 rounded-xl transition ${
                  done ? "bg-emerald-50" : "hover:bg-stone-50"
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-lg shrink-0 ${
                    done ? "bg-emerald-500 text-white" : "bg-stone-100"
                  }`}
                >
                  {done ? "✓" : step.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold ${
                      done ? "text-emerald-900 line-through decoration-emerald-400" : "text-stone-900"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-stone-600 truncate">{step.description}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
