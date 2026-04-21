import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politica de Privacidade — Kindar",
  description: "Politica de Privacidade da plataforma Kindar. Conformidade com LGPD.",
};

export default function PrivacidadePage() {
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
        <h1 className="text-3xl font-bold mb-2">Politica de Privacidade</h1>
        <p className="text-sm text-[#9A8878] mb-8">Versao 1.0 — Ultima atualizacao: Abril 2026 — Conformidade com LGPD</p>

        <div className="prose prose-neutral max-w-none space-y-6 text-[#2C2C2C] text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Identificacao do Controlador</h2>
            <p><strong>E-mail de contato:</strong> contato@kindar.com.br</p>
            <p><strong>Privacidade e dados pessoais:</strong> privacidade@kindar.com.br</p>
            <p><strong>Website:</strong> https://kindar.com.br</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">Preambulo</h2>
            <p>
              Esta Politica de Privacidade foi elaborada em conformidade com a Lei Geral de Protecao de Dados
              Pessoais — LGPD (Lei n. 13.709/2018), o Marco Civil da Internet (Lei n. 12.965/2014) e o
              Estatuto da Crianca e do Adolescente — ECA (Lei n. 8.069/1990).
            </p>
            <p>
              A Plataforma Kindar trata dados pessoais sensiveis, incluindo dados de saude e dados de criancas
              e adolescentes, os quais recebem protecao especial conforme a legislacao vigente.
            </p>
            <p className="font-semibold">
              Ao utilizar a Plataforma, o Usuario declara ter lido e compreendido esta Politica e consente com o
              tratamento de seus dados pessoais conforme aqui descrito.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Dados Pessoais Coletados</h2>

            <h3 className="text-lg font-medium mt-6 mb-2">1.1 Dados do Usuario (Responsavel Legal)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#E8E0D4]">
                    <th className="text-left py-2 pr-4">Dado</th>
                    <th className="text-left py-2 pr-4">Finalidade</th>
                    <th className="text-left py-2">Base Legal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E0D4]/50">
                  <tr><td className="py-2 pr-4">Nome completo</td><td className="pr-4">Identificacao e perfil</td><td>Execucao de contrato</td></tr>
                  <tr><td className="py-2 pr-4">E-mail</td><td className="pr-4">Autenticacao, comunicacao</td><td>Execucao de contrato</td></tr>
                  <tr><td className="py-2 pr-4">Telefone (opcional)</td><td className="pr-4">Contato e notificacoes</td><td>Consentimento</td></tr>
                  <tr><td className="py-2 pr-4">Foto de perfil (opcional)</td><td className="pr-4">Personalizacao</td><td>Consentimento</td></tr>
                  <tr><td className="py-2 pr-4">Papel parental</td><td className="pr-4">Configuracao</td><td>Execucao de contrato</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-medium mt-6 mb-2">1.2 Dados de Criancas e Adolescentes (Art. 14, LGPD)</h3>
            <div className="bg-[#FFF8F0] border border-[#E8E0D4] rounded-lg p-4 mb-4">
              <p className="text-sm"><strong>Atencao especial:</strong> O tratamento de dados de criancas e realizado no seu melhor interesse, conforme Art. 14 da LGPD e Art. 3 do ECA.</p>
            </div>
            <p>Dados coletados: nome, data de nascimento, genero, foto (opcional) e informacoes escolares — todos mediante consentimento especifico do responsavel legal.</p>

            <h3 className="text-lg font-medium mt-6 mb-2">1.3 Dados Sensiveis de Saude (Art. 11, LGPD)</h3>
            <div className="bg-[#FFF8F0] border border-[#E8E0D4] rounded-lg p-4 mb-4">
              <p className="text-sm"><strong>Dados sensiveis:</strong> Classificados conforme Art. 5, II, da LGPD, com protecao reforcada.</p>
            </div>
            <p>Incluem: alergias, medicamentos, consultas medicas, vacinas, doencas, dados de crescimento e profissionais de saude — todos mediante consentimento especifico e destacado.</p>

            <h3 className="text-lg font-medium mt-6 mb-2">1.4 Dados Financeiros</h3>
            <p>Descricao de despesas, valores, categorias, comprovantes e percentual de divisao. A Plataforma <strong>nao</strong> coleta dados bancarios, numeros de cartao ou informacoes de pagamento direto.</p>

            <h3 className="text-lg font-medium mt-6 mb-2">1.5 Dados de Comunicacao</h3>
            <p>Mensagens de chat, historico de conversas e notas privadas.</p>

            <h3 className="text-lg font-medium mt-6 mb-2">1.6 Dados Tecnicos (coletados automaticamente)</h3>
            <p>Endereco IP, tipo de dispositivo/navegador, sistema operacional, dados de sessao (cookies essenciais), registros de acesso e dados de uso anonimizados.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Bases Legais</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Consentimento (Art. 7, I e Art. 11, I):</strong> Dados sensiveis de saude, dados de criancas, dados opcionais</li>
              <li><strong>Execucao de contrato (Art. 7, V):</strong> Cadastro, funcionalidades principais, comunicacao</li>
              <li><strong>Obrigacao legal (Art. 7, II):</strong> Registros de acesso (6 meses, Marco Civil da Internet)</li>
              <li><strong>Legitimo interesse (Art. 7, IX):</strong> Analytics anonimizados, seguranca, prevencao a fraude</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Compartilhamento de Dados</h2>
            <p><strong>Membros do grupo familiar:</strong> Dados inseridos sao compartilhados com os demais membros do grupo (exceto notas privadas).</p>
            <p><strong>Prestadores de servico:</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Supabase — infraestrutura de banco de dados e autenticacao</li>
              <li>Vercel — hospedagem da aplicacao</li>
              <li>Apple (APNs) — notificacoes push no iOS</li>
              <li>PostHog — analytics anonimizados</li>
            </ul>
            <p className="font-semibold mt-4">A Kindar NAO vende, aluga ou comercializa dados pessoais de Usuarios ou criancas a terceiros.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Seguranca dos Dados</h2>
            <p>Medidas implementadas:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Criptografia em transito (TLS)</li>
              <li>Row Level Security (RLS) no banco de dados</li>
              <li>Senhas armazenadas com hash bcrypt</li>
              <li>Tokens de autenticacao com expiracao</li>
              <li>Separacao de ambientes (dev/producao)</li>
              <li>Backups periodicos</li>
              <li>Controle de acesso com principio do menor privilegio</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Retencao e Eliminacao</h2>
            <p><strong>Conta ativa:</strong> Dados mantidos enquanto a conta estiver ativa.</p>
            <p><strong>Apos exclusao da conta:</strong> Dados pessoais eliminados em 30 dias, salvo retencao legal.</p>
            <p><strong>Retencao legal:</strong> Registros de acesso (6 meses, Marco Civil), dados de saude (conforme legislacao de saude), dados para processos judiciais.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Direitos do Titular (Art. 18, LGPD)</h2>
            <p>O titular pode, a qualquer momento, solicitar:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Confirmacao da existencia de tratamento</li>
              <li>Acesso aos dados</li>
              <li>Correcao de dados incompletos ou inexatos</li>
              <li>Anonimizacao, bloqueio ou eliminacao de dados desnecessarios</li>
              <li>Portabilidade dos dados</li>
              <li>Eliminacao dos dados tratados com consentimento</li>
              <li>Informacao sobre compartilhamento de dados</li>
              <li>Revogacao do consentimento</li>
            </ul>
            <p className="mt-4">Para exercer seus direitos: <strong>privacidade@kindar.com.br</strong></p>
            <p>Prazo de resposta: ate 15 dias uteis.</p>
            <p>O titular tambem pode peticionar perante a ANPD: <a href="https://www.gov.br/anpd" className="text-[#C07055] hover:underline" target="_blank" rel="noopener noreferrer">www.gov.br/anpd</a></p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Cookies</h2>
            <p>A Plataforma utiliza cookies essenciais (sessao, autenticacao), funcionais (preferencias) e analiticos (PostHog, anonimizados). Cookies analiticos requerem consentimento previo.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Dados de Menores em Situacoes Especiais</h2>
            <p>Em caso de disputa judicial, dados podem ser fornecidos mediante determinacao judicial. Em situacoes de risco a crianca, dados podem ser compartilhados com autoridades (Conselho Tutelar, Ministerio Publico), conforme Art. 13 do ECA.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Alteracoes nesta Politica</h2>
            <p>A Kindar podera atualizar esta Politica periodicamente. O Usuario sera notificado sobre alteracoes substanciais. Alteracoes que ampliem o compartilhamento de dados requererao novo consentimento.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Contato</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Assuntos gerais:</strong> contato@kindar.com.br</li>
              <li><strong>Privacidade e dados pessoais:</strong> privacidade@kindar.com.br</li>
            </ul>
          </section>
        </div>

        {/* Footer links */}
        <div className="mt-12 pt-8 border-t border-[#E8E0D4] flex flex-wrap gap-4 text-sm text-[#9A8878]">
          <Link href="/termos" className="hover:text-[#C07055] transition-colors">Termos de Uso</Link>
          <Link href="/pricing" className="hover:text-[#C07055] transition-colors">Planos e Precos</Link>
          <Link href="/" className="hover:text-[#C07055] transition-colors">Pagina Inicial</Link>
        </div>
      </main>
    </div>
  );
}
