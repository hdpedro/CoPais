import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Suporte — Kindar",
  description: "Central de suporte do Kindar. Tire suas duvidas, fale com a equipe por email ou WhatsApp.",
};

/**
 * /suporte — Central de suporte publica. Exigida pelo App Store Connect
 * (Support URL obrigatoria em App Information) e pelo Guideline 5.1.1 da
 * Apple (contato claro com o desenvolvedor).
 *
 * A pagina e estatica, indexavel por search engines e acessivel sem login.
 * Listada como link externo no perfil do native (Linking.openURL).
 */
export default function SuportePage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#0E0C0A]">
      {/* Header */}
      <header className="bg-white border-b border-[#E8E0D4]">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kindar-logo.png" alt="" width={28} height={28} className="object-contain" />
            <span className="text-xl font-bold tracking-tight">Kindar</span>
          </Link>
          <Link href="/" className="text-sm text-[#C07055] font-medium hover:underline">
            Voltar
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold mb-2">Central de Suporte</h1>
        <p className="text-sm text-[#9A8878] mb-8">Estamos aqui para ajudar. Escolha o canal que for mais conveniente.</p>

        {/* Canais de contato */}
        <section className="grid gap-4 sm:grid-cols-2 mb-10">
          <a
            href="mailto:suporte@kindar.com.br"
            className="bg-white rounded-xl border border-[#E8E0D4] p-5 hover:border-[#C07055] hover:shadow-sm transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-[#C07055]/10 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-[#C07055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h2 className="text-base font-semibold mb-1">Email</h2>
            <p className="text-sm text-[#6B6B6B]">suporte@kindar.com.br</p>
            <p className="text-xs text-[#9A8878] mt-2">Resposta em ate 48h uteis</p>
          </a>

          <a
            href="https://wa.me/5511999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white rounded-xl border border-[#E8E0D4] p-5 hover:border-[#C07055] hover:shadow-sm transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
            </div>
            <h2 className="text-base font-semibold mb-1">WhatsApp</h2>
            <p className="text-sm text-[#6B6B6B]">Mensagem direta</p>
            <p className="text-xs text-[#9A8878] mt-2">Seg a sex, 9h as 18h (horario de Brasilia)</p>
          </a>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-2xl font-semibold mb-6">Perguntas frequentes</h2>

          <div className="space-y-4">
            <details className="bg-white rounded-xl border border-[#E8E0D4] p-5 group">
              <summary className="flex justify-between items-center cursor-pointer list-none font-semibold text-[#0E0C0A]">
                <span>Como convido o outro responsavel para o grupo da familia?</span>
                <span className="text-[#C07055] group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="mt-3 text-sm text-[#6B6B6B] leading-relaxed">
                Em <strong>Familia</strong>, toque em &quot;Convidar co-responsavel&quot; e informe o email. A pessoa
                recebera um email com link para aceitar o convite. Depois de aceito, os dois passam a ver a mesma
                agenda, despesas e informacoes das criancas.
              </p>
            </details>

            <details className="bg-white rounded-xl border border-[#E8E0D4] p-5 group">
              <summary className="flex justify-between items-center cursor-pointer list-none font-semibold text-[#0E0C0A]">
                <span>Como cancelo minha assinatura?</span>
                <span className="text-[#C07055] group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="mt-3 text-sm text-[#6B6B6B] leading-relaxed">
                Depende de onde voce assinou:
              </p>
              <ul className="mt-2 ml-5 list-disc text-sm text-[#6B6B6B] space-y-1">
                <li><strong>iPhone/iPad:</strong> Ajustes &gt; Apple ID &gt; Assinaturas &gt; Kindar &gt; Cancelar assinatura.</li>
                <li><strong>Web (cartao de credito):</strong> entre em Perfil &gt; Assinatura &gt; Gerenciar no portal Stripe.</li>
              </ul>
              <p className="mt-2 text-sm text-[#6B6B6B]">O acesso premium continua ate o fim do periodo ja pago.</p>
            </details>

            <details className="bg-white rounded-xl border border-[#E8E0D4] p-5 group">
              <summary className="flex justify-between items-center cursor-pointer list-none font-semibold text-[#0E0C0A]">
                <span>Como deleto minha conta?</span>
                <span className="text-[#C07055] group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="mt-3 text-sm text-[#6B6B6B] leading-relaxed">
                No app: <strong>Perfil &gt; Deletar conta</strong>. Vamos pedir que voce confirme digitando DELETAR
                e entao apagamos permanentemente seu perfil, criancas, eventos, despesas, documentos e mensagens.
                A acao e irreversivel. Se estiver em uma familia com outro responsavel, ele mantera os dados que
                criou — apenas os seus dados pessoais sao apagados.
              </p>
            </details>

            <details className="bg-white rounded-xl border border-[#E8E0D4] p-5 group">
              <summary className="flex justify-between items-center cursor-pointer list-none font-semibold text-[#0E0C0A]">
                <span>Esqueci a senha. O que faco?</span>
                <span className="text-[#C07055] group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="mt-3 text-sm text-[#6B6B6B] leading-relaxed">
                Na tela de login, toque em &quot;Esqueceu a senha?&quot; e informe seu email. Voce recebera um link
                para redefinir a senha em instantes. Verifique tambem a caixa de spam.
              </p>
            </details>

            <details className="bg-white rounded-xl border border-[#E8E0D4] p-5 group">
              <summary className="flex justify-between items-center cursor-pointer list-none font-semibold text-[#0E0C0A]">
                <span>Meus dados estao seguros?</span>
                <span className="text-[#C07055] group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="mt-3 text-sm text-[#6B6B6B] leading-relaxed">
                Sim. Todos os dados sao criptografados em transito e em repouso. Seguimos a LGPD, temos
                politicas de acesso baseadas em permissoes (Row Level Security) e nunca compartilhamos
                dados com terceiros. Detalhes completos na nossa{' '}
                <Link href="/privacidade" className="text-[#C07055] underline hover:no-underline">
                  Politica de Privacidade
                </Link>.
              </p>
            </details>

            <details className="bg-white rounded-xl border border-[#E8E0D4] p-5 group">
              <summary className="flex justify-between items-center cursor-pointer list-none font-semibold text-[#0E0C0A]">
                <span>Encontrei um bug ou tenho uma sugestao. Onde reporto?</span>
                <span className="text-[#C07055] group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="mt-3 text-sm text-[#6B6B6B] leading-relaxed">
                Envie um email para <a href="mailto:suporte@kindar.com.br" className="text-[#C07055] underline hover:no-underline">suporte@kindar.com.br</a>{' '}
                com o maximo de detalhes possivel (tela, passos pra reproduzir, screenshot se puder). Todos os
                feedbacks sao lidos e respondidos.
              </p>
            </details>
          </div>
        </section>

        {/* Legal footer */}
        <section className="mt-12 pt-8 border-t border-[#E8E0D4] text-sm text-[#6B6B6B] space-y-2">
          <p>
            <strong>Endereco do desenvolvedor:</strong> Kindar — Brasil
          </p>
          <p>
            Para assuntos sobre privacidade e dados pessoais:{' '}
            <a href="mailto:privacidade@kindar.com.br" className="text-[#C07055] underline hover:no-underline">
              privacidade@kindar.com.br
            </a>
          </p>
          <p className="flex gap-4 flex-wrap pt-2">
            <Link href="/privacidade" className="text-[#C07055] hover:underline">Politica de Privacidade</Link>
            <Link href="/termos" className="text-[#C07055] hover:underline">Termos de Uso</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
