/**
 * Skeleton shape-aware do /perfil — replica o layout final pra evitar
 * "content jump" quando a página real carrega. Cada bloco respeita a
 * altura/proporção do componente equivalente em ProfileContent.tsx.
 *
 * F#1+F#2 (E2E PRD 2026-05-25): skeleton genérico (blobs brancos
 * retangulares) parecia bug em mobile/3G porque user esperava 15s sem
 * dica visual do que ia aparecer. Shape-aware reduz a sensação de
 * espera porque o brain já reconhece a estrutura.
 */
export default function PerfilLoading() {
  return (
    <div className="max-w-lg mx-auto space-y-6 pb-20 animate-pulse">
      {/* Heading "Perfil" */}
      <div className="h-8 w-24 bg-stone-200 rounded" />

      {/* Profile card: avatar 64px + nome/email + member-since + edit button */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-stone-200 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-40 bg-stone-200 rounded" />
            <div className="h-3 w-56 bg-stone-100 rounded" />
            <div className="h-3 w-20 bg-stone-100 rounded" />
          </div>
        </div>
        <div className="py-2 border-t border-[#F0E8DA] space-y-1.5">
          <div className="h-3 w-24 bg-stone-100 rounded" />
          <div className="h-4 w-32 bg-stone-200 rounded" />
        </div>
        <div className="pt-3 border-t border-[#F0E8DA]">
          <div className="h-10 w-full bg-stone-100 rounded-lg" />
        </div>
      </div>

      {/* Meus Grupos header + 1 card */}
      <div>
        <div className="h-5 w-32 bg-stone-200 rounded mb-3" />
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="space-y-1.5">
            <div className="h-4 w-32 bg-stone-200 rounded" />
            <div className="h-3 w-20 bg-stone-100 rounded" />
          </div>
        </div>
      </div>

      {/* WhatsApp section */}
      <div className="bg-white rounded-xl p-4 shadow-sm h-[160px]" />

      {/* Language selector */}
      <div className="bg-white rounded-xl p-4 shadow-sm h-[88px]" />

      {/* 4 quick links cards: Plano, Crianças, Documentos, Notificações */}
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between"
          >
            <div className="h-4 w-40 bg-stone-200 rounded" />
            <div className="h-4 w-4 bg-stone-100 rounded" />
          </div>
        ))}
      </div>

      {/* Logout button */}
      <div className="h-12 w-full bg-[#F5EFE6] rounded-xl" />

      {/* Zona de Perigo card */}
      <div className="mt-8 rounded-xl border border-red-200 bg-red-50/40 p-5 space-y-3">
        <div className="h-3 w-32 bg-red-200 rounded" />
        <div className="h-3 w-56 bg-red-100 rounded" />
        <div className="h-4 w-40 bg-red-200 rounded mt-2" />
      </div>
    </div>
  );
}
