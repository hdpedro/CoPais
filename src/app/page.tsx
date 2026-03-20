import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-light text-dark">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-light/80 backdrop-blur-lg border-b border-dark/5">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-dark tracking-tight">
            2Lares
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
              Coparentalidade inteligente para{" "}
              <span className="text-primary">familias modernas</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted max-w-2xl mx-auto leading-relaxed">
              Organize a rotina dos seus filhos entre dois lares com clareza,
              respeito e tranquilidade. Tudo em um so lugar.
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
              Organizar a rotina de dois lares{" "}
              <span className="text-primary">nao precisa ser dificil</span>
            </h2>
            <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
              Mensagens perdidas, gastos sem controle, consultas esquecidas...
              A falta de organizacao entre os pais gera estresse para todos,
              especialmente para as criancas. O 2Lares resolve isso.
            </p>
            <div className="mt-12 grid sm:grid-cols-3 gap-8 text-left">
              <div className="p-6 rounded-2xl bg-error/5 border border-error/10">
                <div className="text-3xl mb-3">😩</div>
                <h3 className="font-semibold text-dark mb-2">Sem o 2Lares</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Informacoes espalhadas, conflitos por falta de comunicacao, gastos sem transparencia.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-warning/5 border border-warning/10">
                <div className="text-3xl mb-3">🤔</div>
                <h3 className="font-semibold text-dark mb-2">O desafio</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Coordenar horarios, escola, saude e financas entre duas casas exige muita organizacao.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-success/5 border border-success/10">
                <div className="text-3xl mb-3">✅</div>
                <h3 className="font-semibold text-dark mb-2">Com o 2Lares</h3>
                <p className="text-sm text-muted leading-relaxed">
                  Tudo centralizado, transparente e acessivel para ambos os pais, a qualquer momento.
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
                Ferramentas pensadas para simplificar a coparentalidade no dia a dia.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  emoji: "📅",
                  title: "Calendario compartilhado",
                  description:
                    "Visualize a guarda, eventos escolares, consultas e compromissos dos filhos em um calendario unico.",
                },
                {
                  emoji: "💬",
                  title: "Chat mediado",
                  description:
                    "Comunicacao focada nos filhos, com historico completo. Sem discussoes desnecessarias.",
                },
                {
                  emoji: "💰",
                  title: "Controle financeiro",
                  description:
                    "Registre e divida gastos com educacao, saude e lazer. Transparencia total para ambos.",
                },
                {
                  emoji: "🏥",
                  title: "Saude das criancas",
                  description:
                    "Vacinas, alergias, medicacoes e consultas medicas sempre acessiveis e atualizados.",
                },
                {
                  emoji: "📋",
                  title: "Acordos documentados",
                  description:
                    "Formalize combinados sobre rotina, regras e responsabilidades. Tudo registrado.",
                },
                {
                  emoji: "🔒",
                  title: "Privacidade e seguranca",
                  description:
                    "Seus dados sao protegidos com criptografia. Somente os membros do grupo familiar tem acesso.",
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
                  title: "Convide o copais",
                  description: "Envie um convite por link. O outro responsavel aceita em segundos.",
                },
                {
                  step: "3",
                  title: "Organize a rotina",
                  description: "Adicione os filhos, configure o calendario e comece a usar.",
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
              <span className="text-primary">convivem melhor</span>
            </h2>
            <p className="mt-4 text-lg text-muted max-w-xl mx-auto">
              Junte-se a familias que ja transformaram sua rotina de coparentalidade.
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
                    "Calendario compartilhado",
                    "Chat entre copais",
                    "Controle de gastos",
                    "Registro de saude",
                    "Acordos e combinados",
                    "Ate 4 filhos por grupo",
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
                    "Notificacoes avancadas",
                    "Suporte prioritario",
                    "Integracao com calendarios",
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
              Comece hoje. Seus filhos merecem.
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-xl mx-auto">
              Uma rotina mais organizada entre os dois lares faz toda a diferenca
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
              <div className="text-xl font-bold text-white mb-3">2Lares</div>
              <p className="text-sm leading-relaxed">
                Coparentalidade inteligente para familias modernas. Organize a
                rotina dos seus filhos com clareza e tranquilidade.
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
            &copy; 2024-2026 2Lares. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
