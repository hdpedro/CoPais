import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
      <div className="mb-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-dark">Verifique seu e-mail</h1>
        <p className="text-muted mt-3">
          Enviamos um link de confirmação para o seu e-mail.
          Clique no link para ativar sua conta.
        </p>
      </div>

      <div className="bg-primary/5 rounded-lg p-4 mb-6">
        <p className="text-sm text-dark">
          Não recebeu? Verifique a pasta de spam ou lixo eletrônico.
        </p>
      </div>

      <Link
        href="/login"
        className="text-primary font-medium hover:underline text-sm"
      >
        Voltar para o login
      </Link>
    </div>
  );
}
