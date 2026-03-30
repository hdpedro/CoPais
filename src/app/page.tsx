import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { cookies } from "next/headers";

export default async function Home() {
  // Quick cookie check first — avoids slow getUser() call for non-logged-in users
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore.getAll().some(c => c.name.includes("auth-token") || c.name.includes("sb-"));

  if (hasAuthCookie) {
    // Only call getUser if there's an auth cookie present
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      redirect("/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-light text-dark">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-light/80 backdrop-blur-lg border-b border-dark/5">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-dark tracking-tight">
            Kindar
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-dark/70 hover:text-dark transition-colors px-3 py-2"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              className="text-sm font-medium bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors"
            >
              Criar conta
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="pt-32 pb-20 sm:pt-40 sm:pb-28 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block mb-6 px-4 py-1.5 bg-primary-light text-primary text-sm font-medium rounded-full">
              Gratuito para comecar
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-dark leading-tight tracking-tight">
              Organize a rotina de{" "}
              <span className="text-primary">quem voce cuida</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted max-w-2xl mx-auto leading-relaxed">
              Calendario, saude, escola, atividades — tudo em um so lugar
              para sua familia.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center bg-primary text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
              >
                Criar conta gratis
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center text-dark/70 text-lg font-medium px-8 py-4 rounded-xl border border-dark/10 hover:border-dark/20 hover:bg-dark/5 transition-all"
              >
                Ja tem conta? Entrar
              </Link>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 bg-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-dark leading-tight">
              Organizar a rotina das criancas{" "}
              <span className="text-primary">nao precisa ser dificil</span>
            </h2>
            <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
              Consultas esquecidas, atividades desorganizadas, gastos sem controle...
              A falta de organizacao gera estresse para todos,
              especialmente para as criancas. O Kindar resolve isso.
            </p>
            <div className="mt-12 grid sm:grid-cols-3 gap-8 text-left">
              <div className="p-6 rounded-2xl bg-error/5 border border-error/10">
                <div className="text-3xl mb-3">😩</div>
                <h3 className="font-semibold text-dark mb-2">Sem o Kindar</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Informacoes espalhadas, compromissos esquecidos, gastos sem transparencia.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-warning/5 border border-warning/10">
                <div className="text-3xl mb-3">🤔</div>
                <h3 className="font-semibold text-dark mb-2">O desafio</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Coordenar horarios, escola, saude e atividades exige muita organizacao.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-success/5 border border-success/10">
                <div className="text-3xl mb-3">✅</div>
                <h3 className="font-semibold text-dark mb-2">Com o Kindar</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Tudo centralizado, transparente e acessivel para toda a familia, a qualquer momento.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 sm:py-28 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-dark leading-tight">
                Tudo que voce precisa,{" "}
                <span className="text-primary">em um so app</span>
              </h2>
              <p className="mt-4 text-lg text-muted max-w-xl mx-auto">
                Ferramentas pensadas para simplificar a rotina familiar no dia a dia.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  emoji: "📅",
                  title: "Calendario familiar",
                  description:
                    "Visualize eventos, consultas, atividades e compromissos da escola em um calendario unico.",
                },
                {
                  emoji: "💬",
                  title: "Chat da familia",
                  description:
                    "Comunicacao focada nas criancas, com historico completo. Tudo organizado.",
                },
                {
                  emoji: "💰",
                  title: "Controle financeiro",
                  description:
                    "Registre gastos com educacao, saude e lazer. Organize as financas da familia.",
                },
                {
                  emoji: "🏥",
                  title: "Saude das criancas",
                  description:
                    "Vacinas, alergias, medicacoes e consultas medicas sempre acessiveis e atualizados.",
                },
                {
                  emoji: "📋",
                  title: "Atividades e rotina",
                  description:
                    "Organize atividades, checklists e compromissos recorrentes. Nada e esquecido.",
                },
                {
                  emoji: "🔒",
                  title: "Privacidade e seguranca",
                  description:
                    "Seus dados sao protegidos com criptografia. Somente membros da familia tem acesso.",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="group p-6 sm:p-8 rounded-2xl bg-white border border-dark/5 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                >
                  <div className="text-4xl mb-4">{feature.emoji}</div>
                  <h3 className="text-lg font-bold text-dark mb-2 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-muted text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Custody section — dedicated for shared custody families */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-block mb-4 px-3 py-1 bg-primary-light text-primary text-xs font-semibold rounded-full uppercase tracking-wide">
                Para familias com guarda compartilhada
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-dark leading-tight">
                Se voces moram em casas diferentes,{" "}
                <span className="text-primary">o Kindar organiza tudo</span>
              </h2>
              <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
                Escala de guarda, troca de dias, notificacoes de transicao e muito mais.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              {[
                {
                  emoji: "🔄",
                  title: "Escala de guarda",
                  description: "Configure o padrao de guarda quinzenal. Visualize quem fica com as criancas em cada dia.",
                },
                {
                  emoji: "📲",
                  title: "Notificacoes de transicao",
                  description: "Receba lembretes automaticos nos dias de troca. Nunca mais esqueca uma transicao.",
                },
                {
                  emoji: "🔀",
                  title: "Troca de dias",
                  description: "Solicite e aceite trocas de dias com facilidade. Historico completo de alteracoes.",
                },
                {
                  emoji: "📊",
                  title: "Divisao de despesas",
                  description: "Divida gastos entre os responsaveis com transparencia. Saiba quem deve o que.",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="p-6 rounded-2xl bg-primary/5 border border-primary/10"
                >
                  <div className="text-3xl mb-3">{feature.emoji}</div>
                  <h3 className="font-semibold text-dark mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 bg-dark text-white">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                Comece em <span className="text-primary">3 passos simples</span>
              </h2>
              <p className="mt-4 text-lg text-white/60">
                Em menos de 5 minutos voce ja esta organizado.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-8 sm:gap-12">
              {[
                {
                  step: "1",
                  title: "Crie sua conta",
                  description: "Cadastro rapido e gratuito. Sem cartao de credito.",
                },
                {
                  step: "2",
                  title: "Convide a familia",
                  description: "Envie um link para quem cuida junto. Aceita em segundos.",
                },
                {
                  step: "3",
                  title: "Organize tudo",
                  description: "Adicione as criancas, calendario, saude e atividades.",
                },
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary text-white text-xl font-bold mb-5">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Social proof */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 bg-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-dark leading-tight">
              Familias que se organizam melhor,{" "}
              <span className="text-primary">vivem melhor</span>
            </h2>
            <p className="mt-4 text-lg text-muted max-w-xl mx-auto">
              Junte-se a familias que ja transformaram sua rotina.
            </p>
            <div className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-8">
              {[
                { value: "500+", label: "Familias ativas" },
                { value: "10k+", label: "Eventos organizados" },
                { value: "98%", label: "Satisfacao" },
                { value: "4.9", label: "Nota no app" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-3xl sm:text-4xl font-extrabold text-primary">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-sm text-muted">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-20 sm:py-28 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-dark leading-tight">
                Gratis para <span className="text-primary">comecar</span>
              </h2>
              <p className="mt-4 text-lg text-muted max-w-xl mx-auto">
                Tudo que voce precisa, sem custo. Funcionalidades premium em breve.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {/* Free */}
              <div className="relative p-8 rounded-2xl bg-white border-2 border-primary shadow-lg shadow-primary/10">
                <div className="absolute -top-3 left-8 px-3 py-0.5 bg-primary text-white text-xs font-bold rounded-full">
                  ATUAL
                </div>
                <h3 className="text-xl font-bold text-dark">Gratuito</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-dark">R$ 0</span>
                  <span className="text-muted">/mes</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {[
                    "Calendario familiar",
                    "Chat da familia",
                    "Controle de gastos",
                    "Registro de saude",
                    "Atividades e checklists",
                    "Ate 4 criancas por grupo",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-dark/80">
                      <svg className="w-5 h-5 text-primary shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className="mt-8 block w-full text-center bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-dark transition-colors"
                >
                  Comecar gratis
                </Link>
              </div>
              {/* Premium teaser */}
              <div className="p-8 rounded-2xl bg-dark/[0.02] border border-dark/10">
                <h3 className="text-xl font-bold text-dark">Premium</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-dark/30">Em breve</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {[
                    "Tudo do plano gratuito",
                    "Relatorios detalhados",
                    "Exportacao de dados",
                    "IA assistente familiar",
                    "Suporte prioritario",
                    "Criancas ilimitadas",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-dark/40">
                      <svg className="w-5 h-5 text-dark/20 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 block w-full text-center bg-dark/5 text-dark/30 font-semibold py-3 rounded-xl cursor-not-allowed">
                  Em breve
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 bg-primary">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              Comece hoje. Suas criancas merecem.
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-xl mx-auto">
              Uma rotina organizada faz toda a diferenca
              no bem-estar das criancas.
            </p>
            <Link
              href="/signup"
              className="mt-10 inline-flex items-center justify-center bg-white text-primary text-lg font-bold px-10 py-4 rounded-xl hover:bg-white/90 transition-all shadow-lg hover:-translate-y-0.5"
            >
              Criar minha conta gratis
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 bg-dark text-white/60">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-8 sm:gap-12">
            <div>
              <div className="text-xl font-bold text-white mb-3">Kindar</div>
              <p className="text-sm leading-relaxed">
                Organize a rotina de quem voce cuida. Calendario, saude,
                atividades e mais — tudo em um so lugar para sua familia.
              </p>
            </div>
            <div>
              <div className="font-semibold text-white mb-3">Produto</div>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/signup" className="hover:text-white transition-colors">
                    Criar conta
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-white transition-colors">
                    Entrar
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-white mb-3">Legal</div>
              <ul className="space-y-2 text-sm">
                <li>
                  <span className="cursor-default">Termos de uso</span>
                </li>
                <li>
                  <span className="cursor-default">Politica de privacidade</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-white/10 text-sm text-center">
            &copy; 2024-2026 Kindar. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
