interface Props {
  slotsRemaining: number;
  maxSubscribers: number;
  variant?: "hero" | "inline" | "pill";
}

/**
 * Live counter for Early Bird availability. Drop into the landing page,
 * onboarding, or the settings sidebar. Source of data is the
 * v_early_bird_slots_remaining view, cached 30s on the server.
 */
export default function EarlyBirdBadge({
  slotsRemaining,
  maxSubscribers,
  variant = "inline",
}: Props) {
  const soldOut = slotsRemaining <= 0;
  const soldPercent = Math.round(((maxSubscribers - slotsRemaining) / maxSubscribers) * 100);

  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
          soldOut
            ? "bg-stone-200 text-stone-600"
            : slotsRemaining < 100
              ? "bg-orange-100 text-orange-800"
              : "bg-emerald-100 text-emerald-800"
        }`}
      >
        {soldOut ? (
          "Early Bird esgotado"
        ) : (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Restam {slotsRemaining}/{maxSubscribers} Early Bird
          </>
        )}
      </span>
    );
  }

  if (variant === "hero") {
    if (soldOut) {
      return (
        <div className="bg-stone-100 border border-stone-200 rounded-2xl p-5 text-center">
          <p className="text-sm font-semibold text-stone-700">Early Bird esgotou</p>
          <p className="text-xs text-stone-500 mt-1">As {maxSubscribers} vagas de lançamento foram preenchidas.</p>
        </div>
      );
    }
    return (
      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white text-center shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-90">Preço de lançamento</p>
        <p className="text-3xl font-black mt-1">
          R$ 19,90<span className="text-base font-medium opacity-90">/mês para sempre</span>
        </p>
        <div className="mt-3 bg-white/20 rounded-full h-2 overflow-hidden">
          <div className="bg-white h-full transition-all" style={{ width: `${soldPercent}%` }} />
        </div>
        <p className="text-xs font-medium mt-2 opacity-90">
          Restam <strong>{slotsRemaining}</strong> de {maxSubscribers} vagas
        </p>
      </div>
    );
  }

  // inline (default)
  return (
    <div
      className={`rounded-xl p-3 border ${
        soldOut ? "bg-stone-50 border-stone-200" : "bg-emerald-50 border-emerald-200"
      }`}
    >
      <p className="text-sm font-semibold text-stone-900">
        {soldOut ? "Early Bird esgotou" : `Early Bird · R$14,90/mês para sempre`}
      </p>
      <p className="text-xs text-stone-600 mt-0.5">
        {soldOut
          ? `As ${maxSubscribers} vagas foram preenchidas.`
          : `Restam ${slotsRemaining} de ${maxSubscribers} vagas — depois sobe para R$19,90.`}
      </p>
    </div>
  );
}
