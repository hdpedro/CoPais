/**
 * Skeleton shape-aware do /assinatura — replica o layout dos cards de
 * plano (Early Bird verde + Harmonia destacado + Premium Jurídico
 * neutro) pra mitigar "content jump" quando a página real carrega.
 *
 * F#1+F#2 (E2E PRD 2026-05-25): skeleton genérico em /assinatura era
 * particularmente ruim porque a página é parte do funil de pagamento —
 * cold-start de 4-9s deixava user achando que estava broken.
 */
export default function AssinaturaLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-56 bg-stone-200 rounded" />
        <div className="h-4 w-80 bg-stone-100 rounded" />
        <div className="h-4 w-64 bg-stone-100 rounded" />
      </div>

      {/* Plano atual badge (pra users em sub/trial) */}
      <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 h-[52px]" />

      {/* Disclosure consent */}
      <div className="bg-stone-50 border border-stone-100 rounded-xl p-4 h-[120px]" />

      <div className="space-y-4">
        {/* Early Bird card (verde) */}
        <div className="relative bg-white rounded-2xl border-2 border-emerald-200 p-6 space-y-3">
          <div className="absolute -top-3 left-6 bg-emerald-200 h-6 w-48 rounded-full" />
          <div className="h-6 w-56 bg-stone-200 rounded mt-2" />
          <div className="h-4 w-72 bg-stone-100 rounded" />
          <div className="h-10 w-40 bg-stone-200 rounded" />
          <div className="space-y-2 my-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 w-44 bg-stone-100 rounded" />
            ))}
          </div>
          <div className="h-12 w-full bg-emerald-100 rounded-xl mt-4" />
        </div>

        {/* Harmonia card — MAIS POPULAR (brand laranja) */}
        <div className="relative bg-white rounded-2xl border-2 border-[#C07055]/30 p-6 shadow-lg md:scale-[1.02] space-y-3">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#C07055]/30 h-6 w-32 rounded-full" />
          <div className="h-7 w-32 bg-stone-200 rounded mt-2" />
          <div className="h-4 w-64 bg-stone-100 rounded" />
          <div className="h-11 w-32 bg-stone-200 rounded" />
          <div className="h-3 w-56 bg-stone-100 rounded mt-1" />
          <div className="space-y-2 my-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 w-44 bg-stone-100 rounded" />
            ))}
          </div>
          <div className="h-12 w-full bg-[#C07055]/20 rounded-xl mt-4" />
        </div>

        {/* Premium Jurídico card (neutro stone) */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-3">
          <div className="h-6 w-72 bg-stone-100 rounded-full" />
          <div className="h-6 w-44 bg-stone-200 rounded" />
          <div className="h-4 w-56 bg-stone-100 rounded" />
          <div className="h-9 w-32 bg-stone-200 rounded" />
          <div className="space-y-2 my-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 w-44 bg-stone-100 rounded" />
            ))}
          </div>
          <div className="h-12 w-full bg-stone-200 rounded-xl mt-4" />
        </div>

        {/* Link plano anual */}
        <div className="h-12 w-full border border-dashed border-[#C07055]/40 rounded-xl" />
      </div>
    </div>
  );
}
