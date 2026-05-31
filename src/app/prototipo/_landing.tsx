import Link from "next/link";
import {
  Reveal,
  TiltCard,
  MagneticCTA,
  ScrollProgress,
  AnimatedCounter,
  AvatarStack,
  LiveTicker,
  ProductTabs,
  BeforeAfterSlider,
  PricingSection,
  FaqAccordion,
  Marquee,
  ParallaxLayer,
  ThemeToggle,
  DemoFlow,
  AuroraCursor,
  HeroStage,
  MobileNav,
} from "./PrototipoClient";

export default function KindarLandingV2({
  earlyBirdRemaining,
}: {
  earlyBirdRemaining?: number;
}) {
  return (
    <div className="relative min-h-screen text-[var(--proto-ink)] overflow-x-hidden">
      <ScrollProgress />

      {/* ════════════════════════════════ NAVBAR ════════════════════════════════ */}
      <header className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[min(1180px,calc(100%-24px))]">
        <nav className="proto-glass flex items-center justify-between rounded-2xl px-3 sm:px-5 py-2.5">
          <Link href="/" className="flex items-center gap-2 pl-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kindar-logo.png" alt="" width={26} height={26} className="object-contain" aria-hidden />
            <span className="text-[17px] font-bold tracking-tight">Kindar</span>
          </Link>

          <div className="hidden md:flex items-center gap-1 text-[13px] font-medium text-[var(--proto-mute)]">
            <a href="#produto" className="px-3 py-1.5 rounded-lg hover:text-[var(--proto-ink)] hover:bg-[var(--proto-soft)] transition-colors">Produto</a>
            <a href="#demo" className="px-3 py-1.5 rounded-lg hover:text-[var(--proto-ink)] hover:bg-[var(--proto-soft)] transition-colors">Como funciona</a>
            <a href="#whatsapp" className="px-3 py-1.5 rounded-lg hover:text-[var(--proto-ink)] hover:bg-[var(--proto-soft)] transition-colors">WhatsApp</a>
            <a href="#comparativo" className="px-3 py-1.5 rounded-lg hover:text-[var(--proto-ink)] hover:bg-[var(--proto-soft)] transition-colors">Comparar</a>
            <a href="#planos" className="px-3 py-1.5 rounded-lg hover:text-[var(--proto-ink)] hover:bg-[var(--proto-soft)] transition-colors">Planos</a>
            <a href="#faq" className="px-3 py-1.5 rounded-lg hover:text-[var(--proto-ink)] hover:bg-[var(--proto-soft)] transition-colors">FAQ</a>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <ThemeToggle />
            <Link href="/login" className="text-[13px] font-medium text-[var(--proto-ink)]/70 hover:text-[var(--proto-ink)] transition-colors px-2 py-2 hidden md:inline-flex">
              Entrar
            </Link>
            <Link
              href="/signup"
              className="proto-shimmer group inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--proto-on-ink)] hover:text-white bg-[var(--proto-ink)] hover:bg-[var(--proto-terra)] px-4 py-2 rounded-xl transition-all"
            >
              <span className="relative z-10 inline-flex items-center gap-1.5">
                Começar grátis
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="transition-transform group-hover:translate-x-0.5">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
            <MobileNav />
          </div>
        </nav>
      </header>

      <main>
        {/* ════════════════════════════════ HERO — DOIS LARES ════════════════════════════════ */}
        <section className="relative pt-36 pb-16 sm:pt-48 sm:pb-24 px-5 sm:px-8 proto-mesh">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="proto-orb proto-orb--terra" style={{ top: -160, left: -120, width: 540, height: 540 }} />
            <div className="proto-orb proto-orb--teal" style={{ top: "12%", right: -160, width: 500, height: 500 }} />
            <div className="proto-orb proto-orb--peach" style={{ bottom: -220, left: "32%", width: 620, height: 620 }} />
            <div className="absolute inset-0 proto-grid" />
            {/* costura dois-lares */}
            <div className="proto-twohomes">
              <div className="proto-seam" />
              <span className="proto-stitch-dot" />
            </div>
          </div>
          {/* aurora que segue o cursor */}
          <AuroraCursor />

          <div className="relative max-w-3xl mx-auto text-center">
            <Reveal>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--proto-line-2)] proto-glass text-[12px] font-semibold text-[var(--proto-ink)]">
                <span className="flex -space-x-1">
                  <span className="w-2.5 h-2.5 rounded-full ring-2 ring-[var(--proto-card)]" style={{ background: "var(--proto-terra)" }} />
                  <span className="w-2.5 h-2.5 rounded-full ring-2 ring-[var(--proto-card)]" style={{ background: "var(--proto-teal)" }} />
                </span>
                O sistema operacional do co-cuidado
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-7 text-[38px] sm:text-[76px] leading-[0.98] sm:leading-[0.95] tracking-[-0.035em] font-bold">
                Dois lares.
                <br />
                Uma só rotina,{" "}
                <span className="relative inline-block">
                  <span className="proto-serif proto-flow text-transparent bg-clip-text bg-gradient-to-br from-[var(--proto-terra)] to-[var(--proto-teal)]">
                    viva
                  </span>
                  <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 120 12" fill="none" aria-hidden>
                    <path className="proto-underline-path" d="M3 8 Q 40 0 60 6 T 117 5" stroke="url(#hg)" strokeWidth="2.6" strokeLinecap="round" pathLength={1} />
                    <defs>
                      <linearGradient id="hg" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#C07055" />
                        <stop offset="1" stopColor="#2E7268" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
                <br />
                no mesmo lugar.
              </h1>
            </Reveal>

            <Reveal delay={180}>
              <p className="mt-7 text-[17px] sm:text-[19px] leading-relaxed text-[var(--proto-mute)] max-w-xl mx-auto">
                Calendário, saúde, despesas e combinados — sincronizados entre
                todos os responsáveis. Vivam na mesma casa ou em duas: a rotina
                das crianças fica organizada, sem ruído e sem nada esquecido.
              </p>
            </Reveal>

            <Reveal delay={280}>
              <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
                <MagneticCTA href="/signup">
                  Criar conta grátis
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </MagneticCTA>
                <MagneticCTA href="#demo" variant="ghost">
                  Ver um combinado acontecer
                </MagneticCTA>
              </div>
            </Reveal>

            <Reveal delay={380}>
              <div className="mt-9 flex justify-center">
                <AvatarStack />
              </div>
            </Reveal>

            <Reveal delay={440}>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] text-[var(--proto-mute-2)]">
                {["Sem cartão de crédito", "Pronto em 2 minutos", "Funciona no celular"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-[var(--proto-teal)]">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* ── PRODUCT-AS-HERO: dashboard gigante sobre a costura, com tilt 3D ── */}
          <Reveal delay={200} y={40}>
            <div className="relative max-w-5xl mx-auto mt-16 sm:mt-20">
              <HeroStage
                left={
                  <span className="absolute -left-3 top-16 -translate-x-full flex items-center gap-2 text-[12px] font-bold whitespace-nowrap" style={{ color: "var(--proto-terra)" }}>
                    <span className="w-7 h-7 rounded-full grid place-items-center text-white text-[12px]" style={{ background: "var(--proto-terra)" }}>A</span>
                    Casa da Amanda
                  </span>
                }
                right={
                  <span className="absolute -right-3 top-16 translate-x-full flex items-center gap-2 text-[12px] font-bold whitespace-nowrap" style={{ color: "var(--proto-teal)" }}>
                    Casa do Bruno
                    <span className="w-7 h-7 rounded-full grid place-items-center text-white text-[12px]" style={{ background: "var(--proto-teal)" }}>B</span>
                  </span>
                }
              >
                <div className="proto-device">
                  <div className="proto-screen">
                    <HeroDashboard />
                  </div>
                </div>
              </HeroStage>
            </div>
          </Reveal>
        </section>

        {/* ════════════════════════════════ STAT STRIP ════════════════════════════════ */}
        <section className="px-5 sm:px-8 -mt-4">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="proto-glass rounded-3xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[var(--proto-line)]">
                <StatItem kicker="Famílias" value={<AnimatedCounter to={1842} format="br" />} detail="meta da beta" />
                <StatItem kicker="Filhos organizados" value={<AnimatedCounter to={3210} format="br" />} detail="agenda + saúde num lugar" />
                <StatItem kicker="Combinados / mês" value={<AnimatedCounter to={11400} format="br" />} detail="trocas, despesas, acordos" />
                <StatItem kicker="Menos atrito" value={<><AnimatedCounter to={92} />%</>} detail="é a meta de NPS" highlight />
              </div>
            </Reveal>
            <Reveal>
              <p className="mt-3 text-center text-[11px] text-[var(--proto-mute-2)]">
                Números ilustrativos do protótipo — dados reais entram no lançamento.
              </p>
            </Reveal>
            <Reveal delay={120}>
              <div className="mt-6">
                <Marquee />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ════════════════════════════════ MANIFESTO ════════════════════════════════ */}
        <section className="py-32 sm:py-44 px-5 sm:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <Reveal>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--proto-terra)] mb-8">
                Por que existimos
              </p>
            </Reveal>
            <Reveal delay={120}>
              <p className="text-[26px] sm:text-[52px] leading-[1.12] tracking-[-0.02em] font-bold text-[var(--proto-ink)]">
                A infância não cabe num{" "}
                <span className="relative whitespace-nowrap">
                  <span className="text-[var(--proto-mute-2)] line-through decoration-[var(--proto-terra)]/40 decoration-2">grupo de WhatsApp</span>
                </span>
                .
                <br />
                <span className="proto-serif proto-flow text-transparent bg-clip-text bg-gradient-to-br from-[var(--proto-terra)] to-[var(--proto-teal)]">
                  Ela merece um lugar que entende cuidado.
                </span>
              </p>
            </Reveal>
            <Reveal delay={240}>
              <p className="mt-10 text-[17px] text-[var(--proto-mute)] max-w-xl mx-auto leading-relaxed">
                Mensagem perdida no scroll, despesa sem dono, vacina esquecida,
                aniversário do amigo que ninguém anotou. O Kindar nasceu pra
                transformar o caos do dia a dia em algo que respira — e que os
                dois lados confiam.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ════════════════════════════════ PRODUTO (TABS) ════════════════════════════════ */}
        <section id="produto" className="py-24 sm:py-32 px-5 sm:px-8 bg-[var(--proto-card)] border-y border-[var(--proto-line)]">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)] mb-4">O produto, vivo</p>
                <h2 className="text-[30px] sm:text-[60px] leading-[0.98] tracking-[-0.025em] font-bold">
                  Veja como{" "}
                  <span className="proto-serif text-[var(--proto-ink)]">se sente</span>
                  <br />
                  ter tudo num só lugar.
                </h2>
                <p className="mt-6 text-[17px] text-[var(--proto-mute)] leading-relaxed max-w-xl">
                  Quatro telas que substituem o grupo de WhatsApp, a planilha de
                  despesas, o caderno da vacina e a discussão de fim de mês.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="mt-16">
                <ProductTabs />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ════════════════════════════════ DEMO FLOW ════════════════════════════════ */}
        <section id="demo" className="py-24 sm:py-32 px-5 sm:px-8">
          <div className="max-w-5xl mx-auto">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)] mb-4">Um combinado, do início ao fim</p>
                <h2 className="text-[30px] sm:text-[60px] leading-[0.98] tracking-[-0.025em] font-bold">
                  Da despesa lançada ao{" "}
                  <span className="proto-serif text-[var(--proto-mute-2)]">&ldquo;fechado&rdquo;</span>{" "}
                  nos dois lares.
                </h2>
                <p className="mt-6 text-[17px] text-[var(--proto-mute)] leading-relaxed max-w-xl">
                  Sem print, sem cobrança constrangedora, sem &ldquo;você viu minha
                  mensagem?&rdquo;. Acompanhe o fluxo acontecer — passa sozinho, ou
                  passe o mouse pra pausar.
                </p>
              </div>
            </Reveal>
            <Reveal delay={140}>
              <div className="mt-14">
                <DemoFlow />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ════════════════════════════════ BENTO FEATURES ════════════════════════════════ */}
        <section className="py-24 sm:py-32 px-5 sm:px-8 bg-[var(--proto-card)] border-y border-[var(--proto-line)]">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)] mb-4">Tudo que a rotina exige</p>
                <h2 className="text-[30px] sm:text-[60px] leading-[0.98] tracking-[-0.025em] font-bold">
                  Seis pilares.{" "}
                  <span className="proto-serif text-[var(--proto-mute-2)]">Uma família.</span>
                </h2>
              </div>
            </Reveal>

            <div className="mt-16 grid grid-cols-12 gap-3 sm:gap-4 auto-rows-[minmax(200px,auto)]">
              <Reveal className="col-span-12 lg:col-span-7 lg:row-span-2">
                <TiltCard glow="#C07055" className="h-full">
                  <BentoBig kicker="Calendário compartilhado" title="Sabe quem leva, quem busca, quem combinou." body="Visualização clara por criança, com cores por responsável. Cada evento tem dono, hora, lugar — e fica pesquisável pra sempre.">
                    <MiniCalendar />
                  </BentoBig>
                </TiltCard>
              </Reveal>
              <Reveal delay={100} className="col-span-12 sm:col-span-6 lg:col-span-5">
                <TiltCard glow="#2E7268" className="h-full">
                  <BentoMid kicker="Saúde preventiva" title="Carteirinha digital, sempre em dia." body="Motor de vacinas PNI/SBIm 2026. Avisa suave 30, 7 e 1 dia antes — sem pânico, sem vermelho.">
                    <MiniHealth />
                  </BentoMid>
                </TiltCard>
              </Reveal>
              <Reveal delay={160} className="col-span-12 sm:col-span-6 lg:col-span-5">
                <TiltCard glow="#C07055" className="h-full">
                  <BentoMid kicker="Despesas com split" title="Conta dividida, conversa civilizada." body="Lança, divide, aprovação do coparente, histórico imutável. Audit trail completo.">
                    <MiniMoney />
                  </BentoMid>
                </TiltCard>
              </Reveal>
              <Reveal delay={80} className="col-span-12 sm:col-span-6 lg:col-span-4">
                <TiltCard glow="#2E7268" className="h-full">
                  <BentoSmall icon={<SwapIcon />} title="Escala de guarda" body="Configura uma vez, troca rapidinho com saldo de dias." />
                </TiltCard>
              </Reveal>
              <Reveal delay={140} className="col-span-12 sm:col-span-6 lg:col-span-4">
                <TiltCard glow="#C07055" className="h-full">
                  <BentoSmall icon={<ChatIcon />} title="Chat focado" body="Conversa só sobre as crianças. Registro de decisões e temas sensíveis." />
                </TiltCard>
              </Reveal>
              <Reveal delay={200} className="col-span-12 lg:col-span-4">
                <TiltCard glow="#2E7268" className="h-full">
                  <BentoSmall icon={<AiIcon />} title="Resumo da semana" body="Toda sexta uma síntese calma do que rolou e do que vem." />
                </TiltCard>
              </Reveal>
            </div>

            <Reveal delay={120}>
              <div className="mt-4 rounded-3xl border border-[var(--proto-line)] bg-[var(--proto-bg)] p-7 sm:p-9">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)] mb-5">
                  E ainda cabe tudo isto
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {[
                    "Atividades e check-in diário",
                    "Medicamentos e doses",
                    "Consultas com profissionais e endereços",
                    "Carteirinha de vacina",
                    "Documentos: certidão, laudos, receitas, boletins",
                    "Escola e reuniões",
                    "OCR de receita médica",
                    "Acordos e decisões com votação",
                    "Temas sensíveis com privacidade",
                    "Exportação e backup dos dados",
                  ].map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1.5 text-[13px] text-[var(--proto-ink)]/80 bg-[var(--proto-card)] border border-[var(--proto-line)] rounded-full px-3.5 py-1.5"
                    >
                      <span className="w-1 h-1 rounded-full bg-[var(--proto-teal)]" />
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ════════════════════════════════ ASSISTENTE NO WHATSAPP ════════════════════════════════ */}
        <section id="whatsapp" className="py-24 sm:py-32 px-5 sm:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Copy */}
              <Reveal>
                <div>
                  <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#1FA855] mb-5">
                    <span className="relative flex w-2 h-2">
                      <span className="absolute inline-flex w-full h-full rounded-full bg-[#25D366] opacity-75 animate-ping" />
                      <span className="relative inline-flex w-2 h-2 rounded-full bg-[#25D366]" />
                    </span>
                    Assistente no WhatsApp
                  </p>
                  <h2 className="text-[30px] sm:text-[56px] leading-[1.0] tracking-[-0.025em] font-bold">
                    A rotina dos seus filhos,{" "}
                    <span className="proto-serif text-[var(--proto-mute-2)]">no WhatsApp.</span>
                  </h2>
                  <p className="mt-6 text-[17px] text-[var(--proto-mute)] leading-relaxed max-w-xl">
                    Manda texto, áudio ou foto. O Kindar entende, organiza e salva no
                    app — <strong className="text-[var(--proto-ink)] font-semibold">sem você precisar abrir nada</strong>.
                    Ideal pra registrar no momento que acontece.
                  </p>

                  <div className="mt-8 grid sm:grid-cols-2 gap-2.5">
                    {[
                      { icon: "💸", text: "Despesa: “paguei 120 da escola”" },
                      { icon: "🩺", text: "Consulta: “pediatra dia 20 às 14h”" },
                      { icon: "🤒", text: "Saúde: “Joaquim com febre 38.5”" },
                      { icon: "🔄", text: "Troca: “trocar dia 15 com o coparente”" },
                    ].map((f) => (
                      <div
                        key={f.text}
                        className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--proto-card)] border border-[var(--proto-line)]"
                      >
                        <span className="text-base shrink-0">{f.icon}</span>
                        <p className="text-[13px] text-[var(--proto-ink)]/85 leading-snug">{f.text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <a
                      href="https://wa.me/5521999605044?text=Oi%20Kindar!%20Quero%20conhecer."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2.5 bg-[#25D366] text-white text-[15px] font-semibold px-7 py-4 rounded-2xl hover:bg-[#1FA855] transition-all shadow-lg shadow-[#25D366]/25 hover:-translate-y-0.5 active:scale-[0.98]"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      Conversar com o Kindar
                    </a>
                    <Link
                      href="/signup"
                      className="inline-flex items-center justify-center gap-2 text-[15px] font-semibold px-7 py-4 rounded-2xl border border-[var(--proto-line-2)] text-[var(--proto-ink)] hover:border-[var(--proto-ink)]/40 hover:bg-[var(--proto-card)] transition-all"
                    >
                      Criar conta primeiro
                    </Link>
                  </div>

                  <p className="mt-6 text-[12.5px] text-[var(--proto-mute-2)] leading-relaxed">
                    Número oficial{" "}
                    <span className="font-bold text-[var(--proto-ink)] tabular-nums">+55 21 99960-5044</span>{" "}
                    · Verificado pela Meta · Confirma toda ação antes de salvar.
                  </p>
                </div>
              </Reveal>

              {/* Phone mock */}
              <Reveal delay={140}>
                <div className="relative mx-auto w-full max-w-[330px]">
                  <div aria-hidden className="absolute inset-0 -z-10 rounded-[3rem] bg-[#25D366]/15 blur-3xl" />
                  <div className="proto-lightscope rounded-[2.6rem] bg-[#0E0C0A] p-2.5 shadow-[0_40px_90px_-30px_rgba(14,12,10,0.5)]">
                    <div className="rounded-[2.1rem] overflow-hidden" style={{ background: "#ECE5DD" }}>
                      <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: "#075E54" }}>
                        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C07055] to-[#A85D47] grid place-items-center text-white text-[13px] font-bold">K</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-bold text-white leading-tight">Kindar</p>
                          <p className="text-[10px] text-white/70 leading-tight">conta business · online</p>
                        </div>
                      </div>
                      <div
                        className="px-3 py-4 space-y-2"
                        style={{
                          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)",
                          backgroundSize: "20px 20px",
                        }}
                      >
                        <div className="flex justify-center">
                          <span className="px-3 py-1 rounded-full bg-white/85 text-[10px] font-medium text-[#54656F] shadow-sm">HOJE</span>
                        </div>
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 text-[12.5px] text-[#111B21] shadow-sm" style={{ background: "#DCF8C6" }}>
                            Joaquim com febre 38.5
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[12.5px] text-[#111B21] shadow-sm">
                            Registrar febre do <span className="font-semibold">Joaquim</span> — 38.5°C agora?
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-white shadow-sm overflow-hidden">
                            <div className="px-3 py-2 text-[12.5px] text-[#111B21]">Confirma o registro?</div>
                            <div className="grid grid-cols-2 border-t border-black/5 text-[12px] font-semibold text-[#128C7E]">
                              <span className="px-3 py-2 text-center border-r border-black/5">✅ Sim</span>
                              <span className="px-3 py-2 text-center">✗ Cancelar</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[12.5px] text-[#111B21] shadow-sm">
                            🤒 Febre registrada para <span className="font-semibold">Joaquim</span>. O coparente foi avisado pelo app.
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 text-[12.5px] text-[#111B21] shadow-sm" style={{ background: "#DCF8C6" }}>
                            🎙️ áudio · 0:08
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[12.5px] text-[#111B21] shadow-sm">
                            Entendi: “paguei 120 na escola do Joaquim”. Lançar despesa de <span className="font-semibold">R$ 120,00</span> em Educação?
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════ ANTES / DEPOIS ════════════════════════════════ */}
        <section className="py-24 sm:py-32 px-5 sm:px-8">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)] mb-4">Tente arrastar</p>
                <h2 className="text-[30px] sm:text-[60px] leading-[0.98] tracking-[-0.025em] font-bold">
                  De grupo confuso pra{" "}
                  <span className="proto-serif text-[var(--proto-mute-2)]">algo que respira.</span>
                </h2>
                <p className="mt-6 text-[17px] text-[var(--proto-mute)] leading-relaxed max-w-2xl">
                  À esquerda, a vida de antes — três conversas paralelas, despesa
                  sem dono, aniversário escapando. À direita, a mesma semana no Kindar.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="mt-14">
                <BeforeAfterSlider />
              </div>
            </Reveal>
            <Reveal delay={220}>
              <p className="mt-6 text-center text-[12.5px] text-[var(--proto-mute-2)]">
                ← arraste · setas do teclado funcionam · toque também →
              </p>
            </Reveal>
          </div>
        </section>

        {/* ════════════════════════════════ COMPARATIVO ════════════════════════════════ */}
        <section id="comparativo" className="py-24 sm:py-32 px-5 sm:px-8 bg-[var(--proto-card)] border-y border-[var(--proto-line)]">
          <div className="max-w-5xl mx-auto">
            <Reveal>
              <div className="text-center max-w-3xl mx-auto">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)] mb-4">Sendo honesto</p>
                <h2 className="text-[30px] sm:text-[60px] leading-[0.98] tracking-[-0.025em] font-bold">
                  Você já tenta resolver isso.{" "}
                  <span className="proto-serif text-[var(--proto-mute-2)]">Só que com as ferramentas erradas.</span>
                </h2>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="mt-14">
                <ComparisonTable />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ════════════════════════════════ FLUXO 3 PASSOS ════════════════════════════════ */}
        <section className="relative py-28 sm:py-36 px-5 sm:px-8 proto-mesh-dark text-white overflow-hidden">
          <div className="relative max-w-5xl mx-auto">
            <Reveal>
              <div className="max-w-2xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-peach)] mb-4">Em menos de 2 minutos</p>
                <h2 className="text-[30px] sm:text-[60px] leading-[0.98] tracking-[-0.025em] font-bold">
                  Três passos.{" "}
                  <span className="proto-serif text-white/55">Sem mistério.</span>
                </h2>
              </div>
            </Reveal>
            <div className="mt-16 grid sm:grid-cols-3 gap-4">
              {[
                { chip: "30 segundos", title: "Crie sua conta", desc: "Google ou e-mail. Sem cartão, sem onboarding longo." },
                { chip: "1 minuto", title: "Adicione a família", desc: "Convide o coparente, cadastre os filhos. Já abre uma agenda compartilhada." },
                { chip: "Pronto", title: "Use onde quiser", desc: "PWA no navegador, app na App Store. Tudo sincronizado em tempo real." },
              ].map((s, i) => (
                <Reveal key={s.title} delay={i * 120}>
                  <div className="relative h-full p-7 rounded-3xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--proto-terra)]/15 text-[var(--proto-peach)] text-[11px] font-mono mb-6">
                      <span className="w-1 h-1 rounded-full bg-[var(--proto-peach)]" />
                      {s.chip}
                    </span>
                    <div className="flex items-start justify-between">
                      <h3 className="text-[20px] font-bold leading-tight">{s.title}</h3>
                      <span className="proto-serif text-[60px] text-white/10 leading-none">{i + 1}</span>
                    </div>
                    <p className="mt-3 text-[14.5px] leading-relaxed text-white/55">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════ DEPOIMENTOS ════════════════════════════════ */}
        <section className="py-28 sm:py-36 px-5 sm:px-8 bg-[var(--proto-card)] border-b border-[var(--proto-line)]">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="text-center max-w-3xl mx-auto">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)] mb-4">O que dizem</p>
                <h2 className="text-[30px] sm:text-[60px] leading-[0.98] tracking-[-0.025em] font-bold">
                  Menos atrito.{" "}
                  <span className="proto-serif text-[var(--proto-mute-2)]">Mais clareza.</span>
                </h2>
                <p className="mt-5 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--proto-mute-2)] px-3 py-1 rounded-full border border-[var(--proto-line-2)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--proto-mute-2)]" />
                  Depoimentos ilustrativos — beta aberta, ainda sem clientes reais
                </p>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <figure className="mt-16 max-w-4xl mx-auto text-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-[var(--proto-terra)] mx-auto mb-6">
                  <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
                </svg>
                <blockquote className="proto-serif text-[28px] sm:text-[42px] leading-[1.2] text-[var(--proto-ink)] tracking-[-0.01em]">
                  Era caos no WhatsApp com meu ex. Agora a agenda da minha filha
                  está em um lugar só — até a avó dela acompanha.
                </blockquote>
                <figcaption className="mt-8 inline-flex items-center gap-3">
                  <span className="grid place-items-center w-11 h-11 rounded-full bg-[var(--proto-terra)] text-white text-[14px] font-bold">M</span>
                  <span className="text-left">
                    <p className="text-[14px] font-bold text-[var(--proto-ink)]">Mariana</p>
                    <p className="text-[12.5px] text-[var(--proto-mute-2)]">Mãe · separada · São Paulo</p>
                  </span>
                </figcaption>
              </figure>
            </Reveal>

            <div className="mt-20 grid sm:grid-cols-2 gap-4 max-w-5xl mx-auto">
              {[
                { q: "A IA que lê receita médica salvou minha vida. Meu filho tem asma e eu sempre esquecia o que a pediatra prescreveu.", who: "Carlos", role: "Pai · casado · Belo Horizonte", initial: "C", bg: "var(--proto-teal)" },
                { q: "Como advogada, uso o export legal: o cliente entrega um PDF com o histórico de comunicação e acordos, e o processo anda mais rápido.", who: "Dra. Juliana", role: "Advogada de família", initial: "J", bg: "var(--proto-terra)" },
              ].map((t) => (
                <Reveal key={t.who}>
                  <figure className="h-full p-7 rounded-3xl border border-[var(--proto-line)] bg-[var(--proto-soft)] flex flex-col">
                    <blockquote className="text-[16px] leading-relaxed text-[var(--proto-ink)] flex-1">&ldquo;{t.q}&rdquo;</blockquote>
                    <figcaption className="mt-6 pt-5 border-t border-[var(--proto-line)] flex items-center gap-3">
                      <span className="grid place-items-center w-10 h-10 rounded-full text-white text-[13px] font-bold" style={{ background: t.bg }}>{t.initial}</span>
                      <span>
                        <p className="text-[14px] font-bold text-[var(--proto-ink)]">{t.who}</p>
                        <p className="text-[12.5px] text-[var(--proto-mute-2)]">{t.role}</p>
                      </span>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════ PARA QUEM ════════════════════════════════ */}
        <section className="py-24 sm:py-32 px-5 sm:px-8">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)] mb-4">Pra qualquer família que co-cuida</p>
                <h2 className="text-[30px] sm:text-[60px] leading-[0.98] tracking-[-0.025em] font-bold">
                  Funciona pra quem{" "}
                  <span className="proto-serif text-[var(--proto-mute-2)]">divide o cuidado.</span>
                </h2>
              </div>
            </Reveal>
            <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { tag: "Guarda compartilhada", title: "Pais separados", body: "Escala, trocas, despesas com split, transparência por design. Menos ruído, menos prints, menos atrito.", glow: "#C07055" },
                { tag: "Família estendida", title: "Avós, tios, babás", body: "Todo mundo que cuida na mesma agenda — sem precisar virar grupo de WhatsApp com 12 pessoas.", glow: "#2E7268" },
                { tag: "Famílias que moram juntas", title: "Casais que organizam a dois", body: "Não precisa ser separado pra valer a pena. É só uma forma melhor de ver a vida da criança.", glow: "#C07055" },
              ].map((f, i) => (
                <Reveal key={f.title} delay={i * 100}>
                  <TiltCard glow={f.glow} className="h-full">
                    <div className="p-7">
                      <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-[var(--proto-terra)] mb-5">{f.tag}</span>
                      <h3 className="text-[22px] font-bold leading-tight">{f.title}</h3>
                      <p className="mt-3 text-[14.5px] text-[var(--proto-mute)] leading-relaxed">{f.body}</p>
                    </div>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════ PLANOS ════════════════════════════════ */}
        <section id="planos" className="py-24 sm:py-32 px-5 sm:px-8 bg-[var(--proto-card)] border-y border-[var(--proto-line)]">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="text-center max-w-3xl mx-auto">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)] mb-4">Planos</p>
                <h2 className="text-[30px] sm:text-[60px] leading-[0.98] tracking-[-0.025em] font-bold">
                  Comece grátis.{" "}
                  <span className="proto-serif text-[var(--proto-mute-2)]">Pague quando o valor for óbvio.</span>
                </h2>
                <p className="mt-6 text-[16px] text-[var(--proto-mute)]">
                  Só os responsáveis legais pagam. Avós, babá, advogado e mediador
                  entram de graça como convidados — a família inteira num plano só.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="mt-16">
                <PricingSection earlyBirdRemaining={earlyBirdRemaining} />
              </div>
            </Reveal>
            <Reveal delay={220}>
              <p className="mt-10 text-center text-[12.5px] text-[var(--proto-mute-2)]">
                7 dias de Premium Jurídico no cadastro · Sem cartão · Cancele quando quiser
              </p>
              <p className="mt-3 text-center">
                <Link href="/pricing" className="text-[13px] font-semibold text-[var(--proto-terra)] hover:underline">
                  Comparar os planos em detalhe →
                </Link>
              </p>
            </Reveal>
          </div>
        </section>

        {/* ════════════════════════════════ FAQ ════════════════════════════════ */}
        <section id="faq" className="py-24 sm:py-32 px-5 sm:px-8">
          <div className="max-w-3xl mx-auto">
            <Reveal>
              <div className="text-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)] mb-4">Dúvidas frequentes</p>
                <h2 className="text-[30px] sm:text-[60px] leading-[0.98] tracking-[-0.025em] font-bold">
                  Pergunta direto.{" "}
                  <span className="proto-serif text-[var(--proto-mute-2)]">Resposta sem rodeio.</span>
                </h2>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="mt-14">
                <FaqAccordion />
              </div>
            </Reveal>
            <Reveal delay={200}>
              <p className="mt-12 text-center text-[14px] text-[var(--proto-mute-2)]">
                Outra dúvida? Escreve pra gente em{" "}
                <a
                  href="mailto:contato@kindar.com.br"
                  className="text-[var(--proto-terra)] font-semibold hover:underline"
                >
                  contato@kindar.com.br
                </a>
                .
              </p>
            </Reveal>
          </div>
        </section>

        {/* ════════════════════════════════ CTA FINAL ════════════════════════════════ */}
        <section className="relative py-32 sm:py-44 px-5 sm:px-8 proto-mesh overflow-hidden">
          <ParallaxLayer speed={0.12} className="absolute inset-0 pointer-events-none">
            <div className="proto-orb proto-orb--terra" style={{ top: -120, left: "10%", width: 480, height: 480 }} />
          </ParallaxLayer>
          <ParallaxLayer speed={0.22} className="absolute inset-0 pointer-events-none">
            <div className="proto-orb proto-orb--teal" style={{ bottom: -100, right: "5%", width: 520, height: 520 }} />
          </ParallaxLayer>
          {/* costura sutil também no CTA */}
          <div aria-hidden className="proto-twohomes"><div className="proto-seam" /></div>

          <div className="relative max-w-4xl mx-auto text-center">
            <Reveal>
              <h2 className="text-[36px] sm:text-[80px] leading-[0.98] sm:leading-[0.95] tracking-[-0.03em] font-bold">
                Dois lares.{" "}
                <span className="proto-serif text-[var(--proto-mute-2)]">Uma rotina.</span>
                <br />
                Um{" "}
                <span className="proto-serif proto-flow text-transparent bg-clip-text bg-gradient-to-br from-[var(--proto-terra)] to-[var(--proto-teal)]">
                  só lugar.
                </span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-8 text-[18px] text-[var(--proto-mute)] max-w-xl mx-auto">
                Comece grátis. Em 2 minutos a família inteira está sincronizada.
                Sem cartão, sem compromisso.
              </p>
            </Reveal>
            <Reveal delay={220}>
              <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
                <MagneticCTA href="/signup">
                  Criar minha conta grátis
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </MagneticCTA>
                <a
                  href="https://wa.me/5521999605044?text=Oi%20Kindar!"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-base font-semibold px-7 py-4 rounded-2xl border border-[var(--proto-line-2)] text-[var(--proto-ink)] hover:border-[#25D366]/40 hover:bg-[var(--proto-card)] transition-all"
                >
                  <svg className="w-4 h-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Falar pelo WhatsApp
                </a>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="mt-16 pt-12 border-t border-[var(--proto-line-2)]">
                <AppBadges />
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ════════════════════════════════ FOOTER ════════════════════════════════ */}
      <footer className="px-5 sm:px-8 py-16 border-t border-[var(--proto-line)] bg-[var(--proto-card)]">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/kindar-logo.png" alt="" width={24} height={24} className="opacity-80" />
                <span className="text-[18px] font-bold">Kindar</span>
              </div>
              <p className="mt-4 text-[14.5px] text-[var(--proto-mute)] leading-relaxed max-w-md">
                Dois lares, uma rotina. O sistema operacional do co-cuidado,
                pensado por quem vive a rotina das crianças.
              </p>
              <p className="mt-6 text-[12px] text-[var(--proto-mute-2)]">
                Feito com cuidado para quem cuida.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-mute-2)] mb-4">Produto</p>
              <ul className="space-y-2.5 text-[13.5px] text-[var(--proto-ink)]/70">
                <li><a href="#produto" className="hover:text-[var(--proto-ink)]">Funcionalidades</a></li>
                <li><a href="#demo" className="hover:text-[var(--proto-ink)]">Como funciona</a></li>
                <li><a href="#comparativo" className="hover:text-[var(--proto-ink)]">Comparar</a></li>
                <li><a href="#planos" className="hover:text-[var(--proto-ink)]">Planos</a></li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-mute-2)] mb-4">Legal</p>
              <ul className="space-y-2.5 text-[13.5px] text-[var(--proto-ink)]/70">
                <li><Link href="/termos" className="hover:text-[var(--proto-ink)]">Termos</Link></li>
                <li><Link href="/privacidade" className="hover:text-[var(--proto-ink)]">Privacidade</Link></li>
                <li><Link href="/suporte" className="hover:text-[var(--proto-ink)]">Suporte</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-[var(--proto-line)] flex flex-col sm:flex-row justify-between gap-3 text-[12px] text-[var(--proto-mute-2)]">
            <span>© 2024–2026 Kindar. Feito com cuidado em São Paulo.</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--proto-teal)] proto-pulse" />
              Status do sistema · operacional
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Componentes server-only de UI
   ══════════════════════════════════════════════════════════════ */

function StatItem({
  kicker,
  value,
  detail,
  highlight = false,
}: {
  kicker: string;
  value: React.ReactNode;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <div className="px-6 py-5">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--proto-mute-2)]">{kicker}</p>
      <p className={`mt-1 text-[32px] font-bold tracking-[-0.02em] ${highlight ? "text-[var(--proto-terra)]" : "text-[var(--proto-ink)]"}`}>{value}</p>
      <p className="text-[12.5px] text-[var(--proto-mute-2)] mt-0.5">{detail}</p>
    </div>
  );
}

/* ─── HERO DASHBOARD — product-as-hero (parece print do app) ─── */
function HeroDashboard() {
  const days = [
    { d: "Seg", n: 19, who: "A" as const, ev: "Escola · 7h" },
    { d: "Ter", n: 20, who: "A" as const, ev: "Natação · 17h" },
    { d: "Qua", n: 21, who: "X" as const, ev: "Troca · 18h" },
    { d: "Qui", n: 22, who: "B" as const, ev: "Pediatra" },
    { d: "Sex", n: 23, who: "B" as const, ev: "Cinema" },
    { d: "Sáb", n: 24, who: "A" as const, ev: "Vovó" },
    { d: "Dom", n: 25, who: "A" as const, ev: "Parque" },
  ];
  const color = (w: "A" | "B" | "X") =>
    w === "A"
      ? "bg-[#C07055]/10 text-[#C07055] border-[#C07055]/20"
      : w === "B"
      ? "bg-[#2E7268]/10 text-[#2E7268] border-[#2E7268]/20"
      : "bg-[#0E0C0A]/8 text-[#0E0C0A] border-[#0E0C0A]/15";

  return (
    <div className="proto-lightscope grid lg:grid-cols-[1.5fr_1fr] bg-white text-[#0E0C0A]">
      {/* coluna calendário */}
      <div className="p-5 sm:p-6 border-b lg:border-b-0 lg:border-r border-black/[0.06]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-7 h-7 rounded-full bg-[#C07055] text-white text-[11px] font-bold">K</span>
            <div>
              <p className="text-[13px] font-bold leading-tight">Manu · 8 anos</p>
              <p className="text-[11px] text-[#9A8878]">Semana 19–25 de maio</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#2E7268]/8 text-[#2E7268] text-[10px] font-bold tracking-wider">
            <span className="w-1 h-1 rounded-full bg-[#2E7268] proto-pulse" />
            AO VIVO
          </span>
        </div>
        <div className="overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0 sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="grid grid-cols-7 gap-1.5 min-w-[440px] sm:min-w-0">
            {days.map((d) => (
              <div key={d.d} className="min-h-[88px] rounded-xl border border-black/[0.05] p-2 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-[9.5px] font-bold uppercase tracking-widest text-[#9A8878]">{d.d}</span>
                  <span className="text-[12px] font-semibold">{d.n}</span>
                </div>
                <div className={`mt-auto text-[9.5px] font-semibold px-1.5 py-1 rounded-md border leading-tight ${color(d.who)}`}>
                  {d.ev}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#C07055]/20 border border-[#C07055]/30" /> Amanda</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#2E7268]/20 border border-[#2E7268]/30" /> Bruno</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#0E0C0A]/10 border border-[#0E0C0A]/20" /> Transição</span>
        </div>
      </div>

      {/* coluna painel vivo */}
      <div className="p-5 sm:p-6 space-y-3 bg-[#FAFAF8]">
        <LiveTicker />
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-black/[0.06] bg-white p-3.5">
            <p className="text-[9.5px] font-bold uppercase tracking-widest text-[#9A8878]">Saúde</p>
            <p className="text-[18px] font-bold mt-0.5 text-[#0E0C0A]">Em dia</p>
            <p className="text-[11px] text-[#6B6560]">HPV em 12 dias</p>
          </div>
          <div className="rounded-2xl border border-black/[0.06] bg-white p-3.5">
            <p className="text-[9.5px] font-bold uppercase tracking-widest text-[#9A8878]">Próx. troca</p>
            <p className="text-[18px] font-bold mt-0.5 text-[#0E0C0A]">Qua 18h</p>
            <p className="text-[11px] text-[#6B6560]">Amanda → Bruno</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── ComparisonTable — Kindar vs WhatsApp vs Planilha ─── */
function ComparisonTable() {
  const rows = [
    "Tudo da criança num lugar só",
    "Os dois lados veem a mesma coisa",
    "Despesa com aprovação e histórico",
    "Lembrete de vacina automático",
    "Escala de guarda e trocas com saldo",
    "Nada se perde no scroll",
    "Feito pra co-cuidado entre dois lares",
  ];
  // 0 = não, 1 = mais ou menos, 2 = sim
  const wa = [0, 1, 0, 0, 0, 0, 0];
  const sheet = [1, 0, 1, 0, 1, 1, 0];
  const kindar = [2, 2, 2, 2, 2, 2, 2];

  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--proto-line)] bg-[var(--proto-card)]">
     <div className="overflow-x-auto">
      <div className="min-w-[340px]">
      {/* header */}
      <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] text-center">
        <div className="px-4 sm:px-6 py-5 text-left">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--proto-mute-2)]">Compare você mesmo</span>
        </div>
        <div className="px-2 py-5">
          <p className="text-[12px] sm:text-[13px] font-bold text-[var(--proto-mute)]">Grupo de<br className="sm:hidden" /> WhatsApp</p>
        </div>
        <div className="px-2 py-5">
          <p className="text-[12px] sm:text-[13px] font-bold text-[var(--proto-mute)]">Planilha<br className="sm:hidden" /> + agenda</p>
        </div>
        <div className="relative px-2 py-5 proto-compare-hl rounded-t-2xl">
          <p className="text-[12px] sm:text-[14px] font-bold bg-gradient-to-br from-[var(--proto-terra)] to-[var(--proto-teal)] bg-clip-text text-transparent">Kindar</p>
        </div>
      </div>

      {rows.map((r, i) => (
        <div
          key={r}
          className={`grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center text-center border-t border-[var(--proto-line)] ${i % 2 === 1 ? "bg-[var(--proto-soft)]" : ""}`}
        >
          <div className="px-3 sm:px-6 py-3.5 sm:py-4 text-left text-[12px] sm:text-[14px] font-semibold text-[var(--proto-ink)] leading-snug">{r}</div>
          <div className="px-1 sm:px-2 py-3.5 sm:py-4 flex justify-center"><Mark v={wa[i]} /></div>
          <div className="px-1 sm:px-2 py-3.5 sm:py-4 flex justify-center"><Mark v={sheet[i]} /></div>
          <div className="px-1 sm:px-2 py-3.5 sm:py-4 flex justify-center bg-gradient-to-b from-[var(--proto-terra)]/[0.04] to-[var(--proto-teal)]/[0.04]"><Mark v={kindar[i]} strong /></div>
        </div>
      ))}

      <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] border-t border-[var(--proto-line)]">
        <div className="px-4 sm:px-6 py-5" />
        <div />
        <div />
        <div className="px-3 py-5">
          <Link href="/signup" className="inline-flex w-full items-center justify-center gap-1 text-[12px] sm:text-[13px] font-bold text-white bg-[var(--proto-terra)] hover:bg-[var(--proto-terra-deep)] rounded-xl py-2.5 transition-colors">
            Quero esse
          </Link>
        </div>
      </div>
      </div>
     </div>
    </div>
  );
}

function Mark({ v, strong = false }: { v: number; strong?: boolean }) {
  if (v === 2)
    return (
      <span className={`grid place-items-center w-7 h-7 rounded-full ${strong ? "bg-[var(--proto-teal)] text-white" : "bg-[var(--proto-teal)]/12 text-[var(--proto-teal)]"}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    );
  if (v === 1)
    return (
      <span className="grid place-items-center w-7 h-7 rounded-full bg-[var(--proto-mute-2)]/15 text-[var(--proto-mute-2)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 12h12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
      </span>
    );
  return (
    <span className="grid place-items-center w-7 h-7 rounded-full bg-[var(--proto-mute-2)]/8 text-[var(--proto-mute-2)]/50">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
    </span>
  );
}

/* ─── Mini mocks (bento) — telas claras (vira "print") ─── */
function MiniCalendar() {
  const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  // até 2 eventos por dia: [terra=Amanda, teal=Bruno, ink=transição]
  const ev: Record<number, { t: string; c: "terra" | "teal" | "ink" }[]> = {
    0: [{ t: "Escola", c: "terra" }, { t: "Inglês", c: "terra" }],
    1: [{ t: "Natação", c: "terra" }],
    2: [{ t: "Pediatra", c: "teal" }, { t: "Troca", c: "ink" }],
    3: [{ t: "Escola", c: "teal" }],
    4: [{ t: "Cinema", c: "teal" }],
    5: [{ t: "Vovó", c: "terra" }, { t: "Festa", c: "terra" }],
    6: [{ t: "Parque", c: "terra" }],
  };
  const cls = (c: "terra" | "teal" | "ink") =>
    c === "terra" ? "bg-[#C07055]/10 text-[#C07055]" : c === "teal" ? "bg-[#2E7268]/10 text-[#2E7268]" : "bg-[#0E0C0A]/8 text-[#0E0C0A]";
  return (
    <div className="rounded-2xl border border-black/[0.06] overflow-hidden bg-white text-[#0E0C0A]">
      <div className="px-3 py-2 border-b border-black/[0.06] flex items-center justify-between">
        <span className="text-[10.5px] font-bold text-[#0E0C0A]">Maio 19 – 25</span>
        <span className="inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-[#2E7268]">
          <span className="w-1 h-1 rounded-full bg-[#2E7268] proto-pulse" /> Sincronizado
        </span>
      </div>
      <div className="grid grid-cols-7 divide-x divide-black/[0.06]">
        {days.map((d, i) => (
          <div key={d} className="p-2 min-h-[120px] flex flex-col gap-1">
            <p className="text-[9.5px] font-bold uppercase tracking-widest text-[#9A8878] mb-0.5">{d}</p>
            {(ev[i] ?? []).map((e, j) => (
              <div key={j} className={`text-[9.5px] font-semibold px-1.5 py-1 rounded leading-tight ${cls(e.c)}`}>
                {e.t}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
function MiniHealth() {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-[#FAFAF8] p-4 text-[#0E0C0A]">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-widest text-[#2E7268]">Cobertura</span>
        <span className="text-[12px] font-bold">96%</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white overflow-hidden">
        <div className="h-full rounded-full" style={{ width: "96%", background: "linear-gradient(90deg,#2E7268,#C07055)" }} />
      </div>
      <p className="mt-3 text-[11px] text-[#6B6560]">Próximo: HPV em 12 dias</p>
    </div>
  );
}
function MiniMoney() {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-[#FAFAF8] p-4 text-[#0E0C0A]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[#9A8878] font-semibold uppercase tracking-widest text-[10.5px]">Maio</span>
        <span className="font-mono font-bold">R$ 2.567,40</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="rounded-lg bg-white border border-black/[0.06] px-2.5 py-1.5">
          <p className="text-[9.5px] uppercase tracking-widest text-[#9A8878] font-bold">Amanda</p>
          <p className="font-mono font-bold text-[#C07055]">R$ 1.283,70</p>
        </div>
        <div className="rounded-lg bg-white border border-black/[0.06] px-2.5 py-1.5">
          <p className="text-[9.5px] uppercase tracking-widest text-[#9A8878] font-bold">Bruno</p>
          <p className="font-mono font-bold text-[#2E7268]">R$ 1.283,70</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Bento layouts ─── */
function BentoBig({ kicker, title, body, children }: { kicker: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="p-8 h-full grid grid-rows-[auto_auto_1fr] gap-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)]">{kicker}</p>
      <div className="max-w-md">
        <h3 className="text-[26px] sm:text-[30px] leading-[1.1] tracking-[-0.018em] font-bold">{title}</h3>
        <p className="mt-3 text-[14.5px] text-[var(--proto-mute)] leading-relaxed">{body}</p>
      </div>
      <div className="self-end">{children}</div>
    </div>
  );
}
function BentoMid({ kicker, title, body, children }: { kicker: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="p-7 h-full grid grid-rows-[auto_auto_1fr] gap-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-terra)]">{kicker}</p>
      <div>
        <h3 className="text-[22px] leading-tight tracking-[-0.018em] font-bold">{title}</h3>
        <p className="mt-2 text-[13.5px] text-[var(--proto-mute)] leading-relaxed">{body}</p>
      </div>
      <div className="self-end">{children}</div>
    </div>
  );
}
function BentoSmall({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="p-6 h-full">
      <div className="inline-grid place-items-center w-11 h-11 rounded-2xl mb-5" style={{ background: "color-mix(in oklab, var(--glow) 14%, transparent)", color: "var(--glow)" }}>
        {icon}
      </div>
      <h3 className="text-[16px] font-bold leading-tight">{title}</h3>
      <p className="mt-2 text-[13.5px] text-[var(--proto-mute)] leading-relaxed">{body}</p>
    </div>
  );
}

/* ─── Icons ─── */
function SwapIcon() {
  return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M7 7h10l-3-3M17 17H7l3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>);
}
function ChatIcon() {
  return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 12a8 8 0 1 1-3.2-6.4L21 5l-.6 3.2A7.96 7.96 0 0 1 21 12z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /></svg>);
}
function AiIcon() {
  return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.5 4 4 1.5-4 1.5L12 14l-1.5-4-4-1.5 4-1.5L12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8L16.5 18.5l1.8-.7L19 16z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>);
}

/* ─── Baixe o app: App Store (ativo) + Google Play (em breve) ─── */
const APPLE_APP_STORE_URL = "https://apps.apple.com/br/app/kindar/id6762701916";

function AppleLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
function GooglePlayLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M3.609 1.814L13.792 12 3.61 22.186a1.001 1.001 0 0 1-.61-.92V2.734c0-.388.227-.722.61-.92z" fill="#34A853" />
      <path d="M14.5 12.7l2.96-2.96 4.05 2.34c.95.55.95 1.95 0 2.5l-3.86 2.23-3.15-3.15v-.96z" fill="#FBBC04" />
      <path d="M3.609 1.814a.999.999 0 0 1 1.005.013l13.79 7.927-3.904 3.946L3.609 1.814z" fill="#4285F4" />
      <path d="M3.609 22.186l10.89-11.886 3.904 3.946L4.614 22.173a.999.999 0 0 1-1.005.013z" fill="#EA4335" />
    </svg>
  );
}

function AppBadges() {
  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--proto-mute-2)]">
        Baixe o app
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* App Store — ativo */}
        <a
          href={APPLE_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Baixar Kindar na App Store"
          className="group inline-flex h-[54px] items-center gap-3 px-5 rounded-2xl bg-[var(--proto-ink)] text-[var(--proto-on-ink)] shadow-[0_12px_30px_-12px_rgba(14,12,10,0.5)] transition-transform duration-300 hover:-translate-y-0.5"
        >
          <AppleLogo />
          <span className="flex flex-col text-left leading-none">
            <span className="text-[9.5px] font-medium uppercase tracking-wider opacity-70">Baixar na</span>
            <span className="text-[17px] font-bold tracking-tight mt-0.5">App Store</span>
          </span>
        </a>
        {/* Google Play — em breve */}
        <span
          role="img"
          aria-label="Kindar — em breve no Google Play, aguardando aprovação da Google"
          title="Em breve no Google Play — aguardando aprovação"
          className="relative inline-flex h-[54px] items-center gap-3 px-5 rounded-2xl border border-[var(--proto-line-2)] bg-[var(--proto-card)] text-[var(--proto-ink)] cursor-default select-none"
        >
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--proto-terra)] text-white shadow">
            Em breve
          </span>
          <GooglePlayLogo />
          <span className="flex flex-col text-left leading-none">
            <span className="text-[9.5px] font-medium uppercase tracking-wider text-[var(--proto-mute-2)]">Em breve no</span>
            <span className="text-[17px] font-bold tracking-tight mt-0.5">Google Play</span>
          </span>
        </span>
      </div>
      <p className="text-[12.5px] text-[var(--proto-mute-2)] text-center max-w-sm leading-relaxed">
        iOS disponível na App Store. Android em breve — aguardando aprovação da Google.
      </p>
    </div>
  );
}
