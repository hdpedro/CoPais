/**
 * Landing — seção do Assistente WhatsApp.
 *
 * Layout cinemático em 2 colunas (mobile vira stack):
 *  - esquerda: copy + features pill + CTA + número oficial
 *  - direita: mockup de iPhone com chat real do Kindar (CSS puro,
 *    sem assets — mantém SSR fast e Lighthouse score limpo)
 *
 * Cores: WhatsApp green (#25D366 / #128C7E / #075E54) sobre o background
 * sand/cream do site. Avatar do Kindar usa o terracotta da marca.
 */

import Link from "next/link";

const WHATSAPP_E164 = "5521999605044";
const WHATSAPP_DISPLAY = "+55 21 99960-5044";
const WA_LINK = `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent("Oi Kindar! Quero conhecer.")}`;

function WhatsAppIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3 text-[#34B7F1]" viewBox="0 0 16 11" fill="none" aria-hidden="true">
      <path d="M11.071.653a.477.477 0 0 0-.404-.13.477.477 0 0 0-.317.183L4.736 8.6 1.717 5.582a.477.477 0 0 0-.674.673l3.408 3.408a.476.476 0 0 0 .691-.022l5.946-7.755a.477.477 0 0 0-.017-.602z" fill="currentColor" />
      <path d="M14.914.653a.477.477 0 0 0-.404-.13.477.477 0 0 0-.317.183L8.579 8.6l-1.07-1.07a.477.477 0 0 0-.673.673l1.474 1.474a.476.476 0 0 0 .691-.022l5.946-7.755a.477.477 0 0 0-.033-.247z" fill="currentColor" />
    </svg>
  );
}

interface BubbleProps {
  side: "in" | "out";
  time: string;
  children: React.ReactNode;
  withButtons?: { label: string; primary?: boolean }[];
}

function Bubble({ side, time, children, withButtons }: BubbleProps) {
  const isOut = side === "out";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} px-3`}>
      <div
        className={`relative max-w-[78%] px-3 py-2 ${
          isOut
            ? "bg-[#DCF8C6] text-[#111B21] rounded-2xl rounded-br-md shadow-sm"
            : "bg-white text-[#111B21] rounded-2xl rounded-bl-md shadow-sm"
        }`}
      >
        <div className="text-[13px] leading-snug whitespace-pre-line">{children}</div>
        {withButtons && (
          <div className="-mx-3 -mb-2 mt-2 border-t border-black/5">
            {withButtons.map((b, i) => (
              <div
                key={i}
                className={`px-3 py-2 text-[13px] font-medium text-center ${
                  i > 0 ? "border-t border-black/5" : ""
                } ${b.primary ? "text-[#128C7E]" : "text-[#128C7E]"}`}
              >
                {b.label}
              </div>
            ))}
          </div>
        )}
        <div className={`flex items-center justify-end gap-1 mt-0.5 text-[10px] text-[#667781]`}>
          <span>{time}</span>
          {isOut && <CheckIcon />}
        </div>
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      {/* Floating tags */}
      <div className="absolute -top-3 -left-4 z-20 hidden sm:block">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-[#128C7E] text-[11px] font-bold shadow-lg ring-1 ring-black/5">
          🎙️ Áudio
        </span>
      </div>
      <div className="absolute -top-3 right-2 z-20 hidden sm:block">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-[#C07055] text-[11px] font-bold shadow-lg ring-1 ring-black/5">
          📸 Foto
        </span>
      </div>
      <div className="absolute -bottom-3 -right-3 z-20 hidden sm:block">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-[#2E7268] text-[11px] font-bold shadow-lg ring-1 ring-black/5">
          ✅ Confirma antes
        </span>
      </div>

      {/* Glow */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#25D366]/25 via-[#25D366]/5 to-transparent blur-3xl" aria-hidden="true" />

      {/* Phone frame */}
      <div className="relative rounded-[2.4rem] bg-[#0E0C0A] p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/10">
        <div className="relative rounded-[2rem] overflow-hidden bg-[#ECE5DD]" style={{ aspectRatio: "9/19" }}>
          {/* Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full bg-black z-30" aria-hidden="true" />

          {/* Status bar */}
          <div className="relative pt-3 pb-1 px-5 flex items-center justify-between text-[10px] font-semibold text-[#128C7E] bg-[#075E54] z-10">
            <span className="text-white">9:41</span>
            <div className="flex items-center gap-1 text-white/95">
              <span>●●●● 5G</span>
              <svg className="w-4 h-3" viewBox="0 0 24 12" fill="currentColor" aria-hidden="true">
                <rect x="0" y="2" width="20" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" fill="none" />
                <rect x="2" y="4" width="14" height="4" fill="currentColor" />
                <rect x="21" y="4" width="2" height="4" rx="0.5" fill="currentColor" />
              </svg>
            </div>
          </div>

          {/* Header */}
          <div className="bg-[#075E54] text-white px-3 pb-2 flex items-center gap-3">
            <svg className="w-5 h-5 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#C07055] to-[#A85D47] flex items-center justify-center text-white text-sm font-bold shrink-0 ring-2 ring-white/20">
              K
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold leading-tight">Kindar</p>
              <p className="text-[10px] opacity-80 leading-tight">conta business · online</p>
            </div>
            <div className="flex items-center gap-3 text-white/85">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M15 8a3 3 0 11-6 0 3 3 0 016 0zM12 14c-3.3 0-9 1.65-9 5v1h18v-1c0-3.35-5.7-5-9-5z" opacity="0" />
                <path d="M21 6.5l-6 4.5 6 4.5v-9zM3 6h12v12H3z" />
              </svg>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 00-1.02.24l-2.2 2.2a15.05 15.05 0 01-6.59-6.58l2.2-2.21a.96.96 0 00.25-1A11.36 11.36 0 018.5 4a1 1 0 00-1-1H4a1 1 0 00-1 1c0 9.39 7.61 17 17 17a1 1 0 001-1v-3.5a1 1 0 00-1-1z" />
              </svg>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </div>
          </div>

          {/* Chat body — WhatsApp-style wallpaper using radial dots */}
          <div
            className="relative bg-[#ECE5DD] py-3 space-y-2 overflow-hidden"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)",
              backgroundSize: "20px 20px",
            }}
          >
            {/* Date pill */}
            <div className="flex justify-center">
              <span className="px-3 py-1 rounded-full bg-white/85 text-[10px] font-medium text-[#54656F] shadow-sm">
                HOJE
              </span>
            </div>

            <Bubble side="out" time="08:42">
              Joaquim com febre 38.5
            </Bubble>

            <Bubble side="in" time="08:42">
              <span>
                Registrar febre do{" "}
                <span className="font-semibold">Joaquim</span> — 38.5°C agora?
              </span>
            </Bubble>

            <div className="flex justify-start px-3">
              <div className="bg-white rounded-2xl rounded-bl-md shadow-sm overflow-hidden max-w-[78%]">
                <div className="px-3 py-2.5 text-[13px] text-[#111B21]">
                  Confirma o registro?
                </div>
                <div className="border-t border-black/5 grid grid-cols-2">
                  <div className="px-3 py-2 text-[12px] font-semibold text-[#128C7E] text-center border-r border-black/5">
                    ✅ Sim
                  </div>
                  <div className="px-3 py-2 text-[12px] font-semibold text-[#128C7E] text-center">
                    ✗ Cancelar
                  </div>
                </div>
              </div>
            </div>

            <Bubble side="out" time="08:43">
              Sim
            </Bubble>

            <Bubble side="in" time="08:43">
              <span>
                🤒 Febre registrada para{" "}
                <span className="font-semibold">Joaquim</span>. Coparente foi avisado pelo app.
              </span>
            </Bubble>

            <Bubble side="out" time="08:45">
              [🎙️ áudio · 0:08]
            </Bubble>

            <Bubble side="in" time="08:45">
              <span>
                Entendi: <em>&quot;paguei 120 conto na escola do Joaquim&quot;</em>.
                {"\n"}Despesa de <span className="font-semibold">R$ 120,00</span> em Educação?
              </span>
            </Bubble>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingWhatsAppHero() {
  return (
    <section
      id="whatsapp"
      className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, #FAFAF8 0%, #F0F8F2 50%, #FAFAF8 100%)",
      }}
    >
      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-[#25D366]/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" aria-hidden="true" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#128C7E]/8 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" aria-hidden="true" />

      <div className="relative max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
          {/* LEFT: copy */}
          <div>
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 bg-white text-[#128C7E] text-[11px] font-bold rounded-full uppercase tracking-wider ring-1 ring-[#25D366]/20 shadow-sm">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-[#25D366] opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-[#25D366]" />
              </span>
              Novo · Assistente WhatsApp
            </div>

            <h2 className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight">
              A rotina dos seus filhos,{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-[#128C7E]">no WhatsApp</span>
                <svg className="absolute left-0 right-0 -bottom-2 w-full h-3 z-0" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    d="M2 6 Q 50 2, 100 6 T 198 6"
                    stroke="#25D366"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.5"
                  />
                </svg>
              </span>
              .
            </h2>

            <p className="mt-6 text-lg text-[#5A524A] leading-relaxed max-w-xl">
              Mande texto, áudio ou foto. O Kindar entende, organiza e salva no app —
              <strong className="text-[#0E0C0A]"> sem você precisar abrir nada</strong>.
              Ideal pra registrar tudo no momento que acontece.
            </p>

            <div className="mt-8 grid sm:grid-cols-2 gap-3">
              {[
                { icon: "💸", text: "Despesa: \"paguei 120 da escola\"" },
                { icon: "🩺", text: "Consulta: \"pediatra dia 20 às 14h\"" },
                { icon: "🤒", text: "Saúde: \"Joaquim com febre 38.5\"" },
                { icon: "🔄", text: "Troca: \"trocar dia 15 com [coparente]\"" },
              ].map((f) => (
                <div
                  key={f.text}
                  className="flex items-start gap-2.5 p-3 bg-white/70 rounded-xl ring-1 ring-black/[0.04]"
                >
                  <span className="text-base shrink-0">{f.icon}</span>
                  <p className="text-[13px] text-[#0E0C0A] leading-snug">{f.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-3 bg-[#25D366] text-white text-base font-semibold px-7 py-4 rounded-2xl hover:bg-[#20BD5A] transition-all shadow-lg shadow-[#25D366]/25 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <WhatsAppIcon className="w-5 h-5" />
                Conversar com o Kindar
              </a>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 bg-white text-[#0E0C0A] text-base font-semibold px-7 py-4 rounded-2xl border border-black/[0.08] hover:border-black/15 hover:bg-black/[0.02] transition-all"
              >
                Criar conta primeiro
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>

            {/* Number callout */}
            <div className="mt-6 flex items-center gap-3 text-sm text-[#5A524A]">
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wider text-[#9A8878] font-bold">
                  Número oficial
                </span>
                <a
                  href={WA_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[15px] font-bold text-[#0E0C0A] hover:text-[#128C7E] transition-colors tabular-nums"
                >
                  {WHATSAPP_DISPLAY}
                </a>
              </div>
              <div className="h-8 w-px bg-black/10" aria-hidden="true" />
              <p className="text-[12px] text-[#9A8878] leading-tight">
                Verificado pela Meta.
                <br />
                Confirma toda ação antes de salvar.
              </p>
            </div>
          </div>

          {/* RIGHT: phone mockup */}
          <div className="relative">
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
