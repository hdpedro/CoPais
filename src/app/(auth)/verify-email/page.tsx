import Link from "next/link";

/**
 * Tela mostrada após signup bem-sucedido (server action `signUp` faz
 * redirect("/verify-email")). Copy melhorado a pedido do Angelino Barata
 * 2026-05-14 16:11 — user Fernanda passou pelo signup mas nada visual
 * deixou claro que precisava confirmar email. Esta tela é o ponto certo
 * pra orientação explícita.
 */
export default function VerifyEmailPage() {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md mx-auto">
      <div className="mb-6">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            {/* Ícone de envelope aberto com badge — sinaliza "mensagem nova esperando ação" */}
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79V19a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h7" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6 4-2.6" />
            <circle cx="18" cy="6" r="3" fill="currentColor" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-dark">Confirme seu e-mail</h1>
        <p className="text-muted mt-3 text-base leading-relaxed">
          Enviamos um link de verificação pra sua caixa de entrada.
          <br />
          Clique no link pra ativar sua conta e voltar aqui pra entrar.
        </p>
      </div>

      <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 mb-6 text-left">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-dark">
            <span className="font-semibold">Não encontrou?</span> Verifique a pasta de <span className="font-semibold">spam ou lixo eletrônico</span>. O e-mail pode levar até 1 minuto pra chegar.
          </p>
        </div>
      </div>

      <Link
        href="/login"
        className="block w-full py-3 px-4 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors"
      >
        Já confirmei, entrar
      </Link>

      <p className="text-xs text-muted mt-4">
        Você pode reenviar o e-mail pela tela de login se precisar.
      </p>
    </div>
  );
}
