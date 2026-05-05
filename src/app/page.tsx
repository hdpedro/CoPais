import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { cookies } from "next/headers";
import { getEarlyBirdStatus, EARLY_BIRD_MONTHLY_PLAN } from "@/lib/billing/early-bird";
import { getLandingStats } from "@/lib/landing-stats";
import { EVENTS } from "@/lib/analytics";
import ExperimentHeadline from "@/components/landing/ExperimentHeadline";
import LandingPricingPreview from "@/components/landing/LandingPricingPreview";
import LandingFaq from "@/components/landing/LandingFaq";
import LandingSocialProof from "@/components/landing/LandingSocialProof";
import LandingWhatsAppHero from "@/components/landing/LandingWhatsAppHero";
import PageViewTracker from "@/components/analytics/PageViewTracker";

// Revalidate every 30s to keep the Early Bird counter fresh without
// hammering Postgres on every anon page view.
export const revalidate = 30;

export default async function Home() {
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore.getAll().some(c => c.name.includes("auth-token") || c.name.includes("sb-"));

  if (hasAuthCookie) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      redirect("/dashboard");
    }
  }

  const [earlyBird, landingStats] = await Promise.all([
    getEarlyBirdStatus(),
    getLandingStats(),
  ]);
  const earlyBirdMonthly = earlyBird.find((e) => e.planId === EARLY_BIRD_MONTHLY_PLAN);

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#0E0C0A]">
      <PageViewTracker
        event={EVENTS.LANDING_VIEWED}
        properties={{
          early_bird_remaining: earlyBirdMonthly?.slotsRemaining ?? 0,
          active_families: landingStats.activeFamilies,
        }}
      />
      {/* ═══ NAVBAR ═══ */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#FAFAF8]/80 backdrop-blur-xl border-b border-black/[0.04]">
        <nav className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kindar-logo.png" alt="" width={28} height={28} className="object-contain" aria-hidden="true" />
            <span className="text-xl font-bold tracking-tight">Kindar</span>
          </Link>
          <div className="flex items-center gap-2">
            <a
              href="#whatsapp"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-[#128C7E] hover:text-[#0E0C0A] transition-colors px-3 py-2"
            >
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex w-full h-full rounded-full bg-[#25D366] opacity-75 animate-ping" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[#25D366]" />
              </span>
              WhatsApp
            </a>
            <Link href="/login" className="text-sm font-medium text-[#0E0C0A]/60 hover:text-[#0E0C0A] transition-colors px-3 py-2">
              Entrar
            </Link>
            <Link href="/signup" className="text-sm font-semibold bg-[#C07055] text-white px-5 py-2.5 rounded-xl hover:bg-[#A85D47] transition-all">
              Comecar gratis
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* ═══ HERO ═══ */}
        <section className="pt-32 pb-20 sm:pt-44 sm:pb-32 px-5 sm:px-8">
          <div className="max-w-4xl mx-auto text-center">
            {earlyBirdMonthly && !earlyBirdMonthly.isSoldOut ? (
              <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 bg-[#2E7268]/8 text-[#2E7268] text-sm font-semibold rounded-full border border-[#2E7268]/10">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2E7268] animate-pulse" />
                Early Bird · Restam {earlyBirdMonthly.slotsRemaining}/{earlyBirdMonthly.maxSubscribers} vagas a R$19,90/mês para sempre
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 bg-[#2E7268]/8 text-[#2E7268] text-sm font-semibold rounded-full border border-[#2E7268]/10">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2E7268] animate-pulse" />
                Beta aberto — teste gratis
              </div>
            )}
            <ExperimentHeadline earlyBirdRemaining={earlyBirdMonthly?.slotsRemaining} />
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center bg-[#C07055] text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-[#A85D47] transition-all shadow-lg shadow-[#C07055]/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
              >
                Criar conta gratis
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center text-[#6B6560] text-base font-medium px-8 py-4 rounded-xl border border-black/8 hover:border-black/15 hover:bg-black/[0.02] transition-all"
              >
                Ja tem conta? Entrar
              </Link>
            </div>

            {/* Trust chips */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-[13px] text-[#9A8878]">
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-black/[0.04]">
                <svg className="w-3.5 h-3.5 text-[#2E7268]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Sem cartao de credito
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-black/[0.04]">
                <svg className="w-3.5 h-3.5 text-[#2E7268]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Pronto em 2 minutos
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-black/[0.04]">
                <svg className="w-3.5 h-3.5 text-[#2E7268]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Funciona no celular
              </span>
            </div>
          </div>
        </section>

        {/* ═══ PROBLEMA ═══ */}
        <section className="py-20 sm:py-28 px-5 sm:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                Quem cuida de crianca sabe:{" "}
                <span className="text-[#C07055]">o dia a dia e intenso</span>
              </h2>
              <p className="mt-4 text-lg text-[#9A8878] max-w-2xl mx-auto">
                Consultas esquecidas, medicamentos atrasados, informacoes perdidas entre responsaveis, gastos sem controle. O Kindar resolve tudo isso.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
              <div className="p-6 rounded-2xl bg-red-50/60 border border-red-100/80">
                <p className="text-sm font-bold text-red-800/70 uppercase tracking-wider mb-4">Sem o Kindar</p>
                <ul className="space-y-3">
                  {["Informacoes espalhadas em WhatsApp, papel e memoria", "Compromissos esquecidos ou duplicados", "Gastos sem transparencia entre responsaveis", "Historico de saude inacessivel na hora que mais precisa", "Comunicacao confusa e cheia de ruido"].map(item => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-red-900/60">
                      <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-6 rounded-2xl bg-[#2E7268]/[0.05] border border-[#2E7268]/10">
                <p className="text-sm font-bold text-[#2E7268] uppercase tracking-wider mb-4">Com o Kindar</p>
                <ul className="space-y-3">
                  {["Tudo centralizado em um unico app", "Alertas e lembretes automaticos", "Financeiro transparente e compartilhado", "Historico completo de saude, sempre acessivel", "Comunicacao focada no bem-estar da crianca"].map(item => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-[#2E7268]">
                      <svg className="w-4 h-4 text-[#2E7268] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ FUNCIONALIDADES POR CATEGORIA ═══ */}
        <section className="py-20 sm:py-28 px-5 sm:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                Uma plataforma completa,{" "}
                <span className="text-[#C07055]">de verdade</span>
              </h2>
              <p className="mt-4 text-lg text-[#9A8878] max-w-xl mx-auto">
                Tudo que a rotina de uma crianca exige, organizado por quem entende.
              </p>
            </div>

            {/* Category: Rotina */}
            <div className="mb-12">
              <p className="text-[11px] font-bold text-[#C07055] uppercase tracking-widest mb-4 px-1">Rotina e Agenda</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { icon: "📅", title: "Calendario familiar", desc: "Todos os eventos, consultas e atividades em um calendario unico e compartilhado." },
                  { icon: "📋", title: "Atividades da crianca", desc: "Futebol, natacao, terapia, escola — tudo organizado com horarios e lembretes." },
                  { icon: "✅", title: "Check-in diario", desc: "Registre como foi o dia: alimentacao, humor, sono. Historico completo." },
                  { icon: "🔔", title: "Alertas e lembretes", desc: "Notificacoes automaticas para compromissos, medicamentos e trocas de guarda." },
                ].map(f => (
                  <div key={f.title} className="p-5 rounded-2xl bg-white border border-black/[0.04] hover:border-[#C07055]/15 hover:shadow-md transition-all duration-200">
                    <span className="text-2xl">{f.icon}</span>
                    <h3 className="text-[14px] font-bold text-[#0E0C0A] mt-3 mb-1">{f.title}</h3>
                    <p className="text-[13px] text-[#9A8878] leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Category: Saude */}
            <div className="mb-12">
              <p className="text-[11px] font-bold text-[#C07055] uppercase tracking-widest mb-4 px-1">Saude e Cuidados</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { icon: "🏥", title: "Saude completa", desc: "Doencas, alergias, peso, altura — tudo registrado e acessivel por todos os responsaveis." },
                  { icon: "💊", title: "Medicamentos", desc: "Controle de doses, horarios e historico. Nunca mais esquecer um medicamento." },
                  { icon: "🩺", title: "Consultas medicas", desc: "Agenda de pediatra, dentista, especialistas. Com profissionais e enderecos." },
                  { icon: "💉", title: "Vacinas", desc: "Carteirinha digital com calendario completo e alertas de doses pendentes." },
                ].map(f => (
                  <div key={f.title} className="p-5 rounded-2xl bg-white border border-black/[0.04] hover:border-[#C07055]/15 hover:shadow-md transition-all duration-200">
                    <span className="text-2xl">{f.icon}</span>
                    <h3 className="text-[14px] font-bold text-[#0E0C0A] mt-3 mb-1">{f.title}</h3>
                    <p className="text-[13px] text-[#9A8878] leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Category: Comunicacao */}
            <div className="mb-12">
              <p className="text-[11px] font-bold text-[#C07055] uppercase tracking-widest mb-4 px-1">Comunicacao</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { icon: "💬", title: "Chat da familia", desc: "Comunicacao focada na crianca. Sem ruido, com historico. Tudo registrado." },
                  { icon: "🤝", title: "Acordos e decisoes", desc: "Registre acordos entre responsaveis. Votacao, historico e transparencia total." },
                  { icon: "🔒", title: "Temas sensiveis", desc: "Espaco seguro para assuntos delicados, com registro e privacidade." },
                ].map(f => (
                  <div key={f.title} className="p-5 rounded-2xl bg-white border border-black/[0.04] hover:border-[#C07055]/15 hover:shadow-md transition-all duration-200">
                    <span className="text-2xl">{f.icon}</span>
                    <h3 className="text-[14px] font-bold text-[#0E0C0A] mt-3 mb-1">{f.title}</h3>
                    <p className="text-[13px] text-[#9A8878] leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Category: Financeiro e Documentos */}
            <div>
              <p className="text-[11px] font-bold text-[#C07055] uppercase tracking-widest mb-4 px-1">Financeiro e Documentos</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { icon: "💰", title: "Despesas compartilhadas", desc: "Registre gastos, divida valores e acompanhe quem pagou o que. Transparencia total." },
                  { icon: "📄", title: "Documentos", desc: "Guarde documentos importantes: certidao, laudos, receitas, boletins." },
                  { icon: "🏫", title: "Escola", desc: "Informacoes escolares, professores, horarios, reunioes — tudo em um so lugar." },
                ].map(f => (
                  <div key={f.title} className="p-5 rounded-2xl bg-white border border-black/[0.04] hover:border-[#C07055]/15 hover:shadow-md transition-all duration-200">
                    <span className="text-2xl">{f.icon}</span>
                    <h3 className="text-[14px] font-bold text-[#0E0C0A] mt-3 mb-1">{f.title}</h3>
                    <p className="text-[13px] text-[#9A8878] leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ WHATSAPP HERO ═══ */}
        <LandingWhatsAppHero />

        {/* ═══ GUARDA COMPARTILHADA ═══ */}
        <section className="py-20 sm:py-28 px-5 sm:px-8 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 bg-[#C07055]/8 text-[#C07055] text-xs font-bold rounded-full uppercase tracking-wider">
                Para familias com guarda compartilhada
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                Dois lares, uma so rotina.{" "}
                <span className="text-[#C07055]">Organizada.</span>
              </h2>
              <p className="mt-4 text-lg text-[#9A8878] max-w-2xl mx-auto">
                Quando a crianca vive entre duas casas, a organizacao precisa ser impecavel. O Kindar faz isso por voces.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: "🔄", title: "Escala de guarda", desc: "Configure escalas quinzenais ou personalizadas. Visualize quem esta com a crianca em cada dia." },
                { icon: "📲", title: "Trocas e transicoes", desc: "Solicite trocas de dias, receba notificacoes de transicao. Historico completo de alteracoes." },
                { icon: "👀", title: "Transparencia total", desc: "Ambos os responsaveis veem a mesma informacao: saude, escola, atividades, gastos." },
                { icon: "📊", title: "Resumo semanal", desc: "Analise inteligente da semana: atividades, check-ins, pendencias e insights automaticos." },
              ].map(f => (
                <div key={f.title} className="p-5 rounded-2xl bg-[#C07055]/[0.04] border border-[#C07055]/10 hover:bg-[#C07055]/[0.07] transition-colors">
                  <span className="text-2xl">{f.icon}</span>
                  <h3 className="text-[14px] font-bold text-[#0E0C0A] mt-3 mb-1">{f.title}</h3>
                  <p className="text-[13px] text-[#9A8878] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ BENEFICIOS ═══ */}
        <section className="py-20 sm:py-28 px-5 sm:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-12">
              O resultado:{" "}
              <span className="text-[#2E7268]">menos estresse, mais organizacao</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {[
                { icon: "🧘", label: "Menos estresse" },
                { icon: "📐", label: "Mais organizacao" },
                { icon: "🔍", label: "Mais transparencia" },
                { icon: "😊", label: "Melhor rotina" },
              ].map(b => (
                <div key={b.label} className="p-5 rounded-2xl bg-white border border-black/[0.04]">
                  <span className="text-3xl">{b.icon}</span>
                  <p className="text-[13px] font-semibold text-[#0E0C0A] mt-3">{b.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ PARA QUEM ═══ */}
        <section className="py-20 sm:py-28 px-5 sm:px-8 bg-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
              Para quem e o Kindar?
            </h2>
            <p className="text-lg text-[#9A8878] max-w-xl mx-auto mb-12">
              Qualquer familia que precisa organizar a rotina das criancas com mais clareza.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: "👨‍👩‍👧", title: "Pais separados", desc: "Guarda compartilhada organizada, com transparencia e menos conflito." },
                { icon: "👪", title: "Familias que co-cuidam", desc: "Avos, tios, babas — todos na mesma pagina sobre a rotina da crianca." },
                { icon: "👩‍⚕️", title: "Responsaveis organizados", desc: "Para quem quer um registro completo e acessivel da vida da crianca." },
              ].map(p => (
                <div key={p.title} className="p-6 rounded-2xl bg-[#FAFAF8] border border-black/[0.04]">
                  <span className="text-3xl">{p.icon}</span>
                  <h3 className="text-[15px] font-bold text-[#0E0C0A] mt-3 mb-1.5">{p.title}</h3>
                  <p className="text-[13px] text-[#9A8878] leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ COMO FUNCIONA ═══ */}
        <section className="py-20 sm:py-28 px-5 sm:px-8 bg-[#0E0C0A] text-white">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                Comece em <span className="text-[#C07055]">3 passos</span>
              </h2>
              <p className="mt-4 text-lg text-white/50">
                Em menos de 2 minutos voce ja esta organizado.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-8">
              {[
                { step: "1", title: "Crie sua conta", desc: "Cadastro rapido com Google ou e-mail. Sem cartao de credito." },
                { step: "2", title: "Adicione a familia", desc: "Convide o outro responsavel e cadastre as criancas." },
                { step: "3", title: "Organize tudo", desc: "Calendario, saude, atividades, despesas — tudo em um so lugar." },
              ].map(s => (
                <div key={s.step} className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#C07055] text-white text-lg font-bold mb-4">
                    {s.step}
                  </div>
                  <h3 className="text-base font-bold mb-2">{s.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ PRICING PREVIEW (Fase 5 growth) ═══ */}
        <LandingPricingPreview
          earlyBirdRemaining={earlyBirdMonthly?.slotsRemaining}
          earlyBirdMax={earlyBirdMonthly?.maxSubscribers}
        />

        {/* ═══ SOCIAL PROOF ═══ */}
        <LandingSocialProof
          activeFamilies={landingStats.activeFamilies}
          childrenOrganized={landingStats.childrenOrganized}
        />

        {/* ═══ FAQ ═══ */}
        <LandingFaq />

        {/* ═══ CTA FINAL ═══ */}
        <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-br from-[#C07055] to-[#A85D47]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              A rotina da sua familia merece mais organizacao.
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-xl mx-auto">
              Comece gratis. Sem compromisso. Sem cartao de credito. Ou fale direto pelo WhatsApp.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center bg-white text-[#C07055] text-lg font-bold px-10 py-4 rounded-xl hover:bg-white/95 transition-all shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
              >
                Criar minha conta gratis
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <a
                href="https://wa.me/5521999605044?text=Oi%20Kindar!"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#25D366] text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-[#20BD5A] transition-all shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Falar pelo WhatsApp
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ═══ FOOTER ═══ */}
      <footer className="py-12 px-5 sm:px-8 bg-[#0E0C0A] text-white/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/kindar-logo.png" alt="" width={20} height={20} className="object-contain opacity-70" />
                <span className="text-lg font-bold text-white">Kindar</span>
              </div>
              <p className="text-sm leading-relaxed">
                A rotina da crianca, organizada em um so lugar. Para familias que cuidam com clareza e transparencia.
              </p>
            </div>
            <div>
              <p className="font-semibold text-white mb-3 text-sm">Produto</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/signup" className="hover:text-white transition-colors">Criar conta</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Entrar</Link></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors">Planos</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white mb-3 text-sm">Legal</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/termos" className="hover:text-white transition-colors">Termos de uso</Link></li>
                <li><Link href="/privacidade" className="hover:text-white transition-colors">Politica de privacidade</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-white/10 text-xs text-center">
            &copy; 2024-2026 Kindar. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
