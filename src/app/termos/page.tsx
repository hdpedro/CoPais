import Link from "next/link";
import type { Metadata } from "next";
import { trialDaysInAppPublic } from "@/lib/billing/promo";

export const metadata: Metadata = {
  title: "Termos de Uso — Kindar",
  description: "Termos de Uso da plataforma Kindar",
};

export default function TermosPage() {
  const trialDays = trialDaysInAppPublic();
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
        <h1 className="text-3xl font-bold mb-2">Termos de Uso</h1>
        <p className="text-sm text-[#9A8878] mb-8">Versao 1.0 — Ultima atualizacao: Abril 2026</p>

        <div className="prose prose-neutral max-w-none space-y-6 text-[#2C2C2C] text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Identificacao</h2>
            <p><strong>E-mail de contato:</strong> contato@kindar.com.br</p>
            <p><strong>Website:</strong> https://kindar.com.br</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Preambulo</h2>
            <p>
              Os presentes Termos de Uso regulam as condicoes de acesso e utilizacao da plataforma Kindar,
              disponibilizada por meio de aplicativo web e aplicativo movel (iOS), acessivel pelo endereco
              https://kindar.com.br.
            </p>
            <p>
              Ao acessar, cadastrar-se ou utilizar a Plataforma, o usuario declara ter lido, compreendido e
              concordado integralmente com estes Termos e com a{" "}
              <Link href="/privacidade" className="text-[#C07055] hover:underline">Politica de Privacidade</Link>.
            </p>
            <p className="font-semibold">
              Caso nao concorde com qualquer disposicao destes Termos, o Usuario devera abster-se de utilizar a Plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Do Objeto</h2>
            <p>
              A Plataforma Kindar e uma ferramenta digital de apoio a coparentalidade, destinada a facilitar a
              organizacao, comunicacao e gestao compartilhada de responsabilidades parentais entre responsaveis
              legais.
            </p>
            <p>A Plataforma oferece funcionalidades que incluem:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Calendario de guarda e convivencia</strong> — organizacao de escalas de custodia, compromissos e eventos</li>
              <li><strong>Comunicacao entre responsaveis</strong> — canal de mensagens para troca de informacoes sobre os filhos</li>
              <li><strong>Gestao de saude</strong> — registro de alergias, medicamentos, consultas, vacinas e crescimento</li>
              <li><strong>Gestao de despesas</strong> — registro e divisao de despesas compartilhadas</li>
              <li><strong>Decisoes compartilhadas</strong> — ferramenta para decisoes conjuntas sobre os filhos</li>
              <li><strong>Documentos</strong> — armazenamento e compartilhamento de documentos</li>
              <li><strong>Atividades</strong> — registro de atividades extracurriculares</li>
              <li><strong>Check-in emocional</strong> — acompanhamento do bem-estar emocional</li>
            </ul>
            <div className="bg-[#FFF8F0] border border-[#E8E0D4] rounded-lg p-4 mt-4">
              <p className="text-sm">
                <strong>Aviso importante:</strong> A Plataforma nao constitui e nao substitui servico de mediacao
                familiar, assessoria juridica, servico medico ou decisao judicial. Para questoes juridicas, medicas
                ou psicologicas, busque profissionais habilitados.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Do Cadastro e da Conta</h2>
            <p>Para utilizar a Plataforma, o Usuario devera realizar cadastro fornecendo informacoes verdadeiras, completas e atualizadas.</p>
            <p><strong>Idade minima:</strong> O cadastro e restrito a pessoas maiores de 18 anos, ou maiores de 16 anos legalmente emancipados, que detenham responsabilidade legal sobre criancas ou adolescentes.</p>
            <p>O Usuario e responsavel por manter a confidencialidade de suas credenciais de acesso e por todas as atividades realizadas em sua conta.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Grupos Familiares</h2>
            <p>A Plataforma opera por meio de grupos familiares, compostos por responsaveis legais vinculados a uma ou mais criancas.</p>
            <p>As informacoes registradas no grupo familiar sao compartilhadas entre os membros do respectivo grupo.</p>
            <p>Determinadas funcionalidades permitem o registro de notas privadas, visiveis apenas ao Usuario que as criou.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Responsabilidades do Usuario</h2>
            <p>O Usuario compromete-se a utilizar a Plataforma de forma etica e legal, obrigando-se a fornecer informacoes verdadeiras, respeitar a privacidade dos demais Usuarios e, especialmente, das criancas registradas.</p>
            <p><strong>E expressamente proibido:</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Utilizar a Plataforma como instrumento de assedio, intimidacao ou violencia psicologica</li>
              <li>Inserir conteudo falso, ofensivo, discriminatorio ou ilegal</li>
              <li>Acessar a conta de outro Usuario sem autorizacao</li>
              <li>Utilizar mecanismos automatizados para acessar ou extrair dados</li>
              <li>Realizar engenharia reversa de qualquer parte da Plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Comunicacao entre Responsaveis</h2>
            <p>As mensagens trocadas na Plataforma sao armazenadas como historico de comunicacao entre as partes.</p>
            <p>A Kindar nao monitora ativamente o conteudo das mensagens, mas reserva-se o direito de analisa-lo em caso de denuncia ou determinacao judicial.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Propriedade Intelectual</h2>
            <p>A Plataforma e seus elementos sao protegidos pela legislacao de propriedade intelectual. O Usuario nao adquire qualquer direito de propriedade intelectual pelo uso da Plataforma.</p>
            <p>O conteudo inserido pelo Usuario permanece de sua titularidade. Ao inseri-lo, o Usuario concede licenca limitada para armazenar, processar e exibir tal conteudo para prestacao do servico.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Limitacao de Responsabilidade</h2>
            <p>A Plataforma e fornecida &quot;no estado em que se encontra&quot;, sem garantias expressas ou implicitas. A Kindar nao se responsabiliza por decisoes tomadas com base nas informacoes da Plataforma.</p>
            <p>A Plataforma nao substitui qualquer obrigacao legal dos responsaveis parentais e nao atua como mediadora de conflitos entre Usuarios.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Suspensao e Cancelamento</h2>
            <p>O Usuario podera solicitar o cancelamento de sua conta a qualquer momento pelo e-mail contato@kindar.com.br.</p>
            <p>A Kindar podera suspender ou cancelar contas que violem estes Termos, por uso ilegal, por pratica de assedio, ou por determinacao judicial.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Assinaturas e Pagamentos</h2>
            <p>A Plataforma Kindar oferece um período de teste gratuito de {trialDays} dias e o plano pago Harmonia, que libera todas as funcionalidades para o grupo familiar.</p>
            <p><strong>Assinaturas auto-renovaveis:</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>As assinaturas sao renovadas automaticamente ao final de cada periodo (mensal ou anual), salvo cancelamento previo pelo Usuario.</li>
              <li>O pagamento e processado pela Apple (via App Store) ou pelo Stripe (via web), conforme a plataforma utilizada.</li>
              <li>O período de teste gratuito de {trialDays} dias está disponível para novos assinantes. Após o período de teste, a assinatura será cobrada automaticamente.</li>
              <li>O Usuario pode cancelar a assinatura a qualquer momento. No caso de assinaturas pela App Store, o cancelamento e feito nas configuracoes da conta Apple.</li>
              <li>O cancelamento entra em vigor ao final do periodo ja pago. Nao ha reembolso proporcional.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Modificacoes nos Termos</h2>
            <p>A Kindar reserva-se o direito de modificar estes Termos, mediante publicacao da versao atualizada. O Usuario sera notificado sobre alteracoes substanciais com antecedencia minima de 15 dias.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">11. Lei Aplicavel e Foro</h2>
            <p>Estes Termos sao regidos pela legislacao da Republica Federativa do Brasil, em especial o Codigo Civil, Marco Civil da Internet, LGPD, Codigo de Defesa do Consumidor e ECA.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">12. Contato</h2>
            <p>Para duvidas, sugestoes ou reclamacoes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>E-mail:</strong> contato@kindar.com.br</li>
              <li><strong>Website:</strong> https://kindar.com.br</li>
            </ul>
          </section>
        </div>

        {/* Footer links */}
        <div className="mt-12 pt-8 border-t border-[#E8E0D4] flex flex-wrap gap-4 text-sm text-[#9A8878]">
          <Link href="/privacidade" className="hover:text-[#C07055] transition-colors">Politica de Privacidade</Link>
          <Link href="/pricing" className="hover:text-[#C07055] transition-colors">Planos e Precos</Link>
          <Link href="/" className="hover:text-[#C07055] transition-colors">Pagina Inicial</Link>
        </div>
      </main>
    </div>
  );
}
