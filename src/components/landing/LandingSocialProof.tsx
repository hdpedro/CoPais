import { TESTIMONIALS } from "@/data/testimonials";

interface Props {
  activeFamilies?: number;
  childrenOrganized?: number;
}

/**
 * Social proof band — hard numbers + soft testimonials.
 *
 * Numbers come from the server (real Supabase counts via getLandingStats).
 * Testimonials are read from `src/data/testimonials.ts` — edit that file
 * to add/remove quotes without touching this component.
 */
export default function LandingSocialProof({
  activeFamilies = 0,
  childrenOrganized = 0,
}: Props) {
  const showNumbers = activeFamilies >= 10; // don't brag when you have 3 users
  const testimonials = TESTIMONIALS.slice(0, 3);

  return (
    <section className="py-20 sm:py-24 px-5 sm:px-8 bg-white">
      <div className="max-w-6xl mx-auto">
        {showNumbers && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-16 text-center">
            <div>
              <p className="text-3xl sm:text-4xl font-extrabold text-[#C07055]">
                {activeFamilies.toLocaleString("pt-BR")}+
              </p>
              <p className="text-sm text-[#6B6560] mt-1">Famílias organizando pelo Kindar</p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-extrabold text-[#C07055]">
                {childrenOrganized.toLocaleString("pt-BR")}+
              </p>
              <p className="text-sm text-[#6B6560] mt-1">Crianças com rotina compartilhada</p>
            </div>
            <div className="col-span-2 md:col-span-1">
              <p className="text-3xl sm:text-4xl font-extrabold text-[#C07055]">5</p>
              <p className="text-sm text-[#6B6560] mt-1">Idiomas · Disponível PWA + iOS + Android</p>
            </div>
          </div>
        )}

        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold leading-tight">Quem usa o Kindar diz:</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div
              key={t.author}
              className="bg-[#F7F2EC] rounded-2xl p-6 flex flex-col"
            >
              <p className="text-[15px] text-[#0E0C0A] leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mt-4 border-t border-black/[0.06] pt-3">
                <p className="text-sm font-semibold text-[#0E0C0A]">{t.author}</p>
                <p className="text-xs text-[#9A8878] mt-0.5">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
