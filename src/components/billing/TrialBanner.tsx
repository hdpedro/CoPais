import Link from "next/link";

interface Props {
  daysRemaining: number;
  planLabel?: string;
}

/**
 * Shown on the dashboard during the 7-day Premium Jurídico trial.
 * Disappears when the trial ends (status flips to 'expired') because the
 * parent page only renders this when subscription.isTrial is true.
 */
export default function TrialBanner({ daysRemaining, planLabel = "Premium Jurídico" }: Props) {
  const urgent = daysRemaining <= 2;
  const dayLabel = daysRemaining === 1 ? "dia" : "dias";

  return (
    <Link
      href="/assinatura"
      className={`block rounded-2xl p-4 mb-4 transition hover:shadow-sm ${
        urgent
          ? "bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-300"
          : "bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-stone-900">
            {urgent ? "⏰ Sua degustação está acabando" : `🎁 ${planLabel} liberado`}
          </p>
          <p className="text-xs text-stone-700 mt-0.5">
            {daysRemaining > 0
              ? `${daysRemaining} ${dayLabel} ${daysRemaining === 1 ? "restante" : "restantes"} — aproveite IA, OCR e saúde completa.`
              : "Termina hoje — escolha um plano para manter o acesso."}
          </p>
        </div>
        <span className="text-sm font-semibold text-emerald-700 shrink-0">
          Ver planos →
        </span>
      </div>
    </Link>
  );
}
