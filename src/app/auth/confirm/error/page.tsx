import Link from "next/link";
import { getRequestLocale } from "@/i18n/server";
import { getServerT } from "@/i18n/server";

/**
 * UI premium em caso de falha na confirmação por token_hash.
 *
 * Estados (param `reason`):
 *   - `expired` — link expirou (TTL Supabase: 24h pra signup, 1h pra recovery)
 *   - `already_used` — link já foi clicado; tenta entrar direto
 *   - `invalid` — token malformado / nunca existiu
 *   - `network` — falha temporária no Supabase Auth
 *   - `unknown` — qualquer outro erro (logado em `app_errors`)
 *
 * Cada estado mostra mensagem específica + 3 ações:
 *   - "Reenviar e-mail" (form action → /auth/resend; usa `email` query se presente)
 *   - "Tentar entrar" (→ /login)
 *   - "Falar com o suporte" (mailto:suporte@kindar.com.br)
 *
 * Server component — `useI18n` é client-only, então usamos `getServerT`.
 */
type Reason = "expired" | "already_used" | "invalid" | "network" | "unknown";

export default async function ConfirmErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; email?: string }>;
}) {
  const params = await searchParams;
  const reason: Reason = isReason(params.reason) ? params.reason : "unknown";
  const email = params.email ?? "";

  const locale = await getRequestLocale();
  const t = await getServerT(locale);

  const reasonKeyMap: Record<Reason, string> = {
    expired: "auth.confirm.errorReasonExpired",
    already_used: "auth.confirm.errorReasonAlreadyUsed",
    invalid: "auth.confirm.errorReasonInvalid",
    network: "auth.confirm.errorReasonNetwork",
    unknown: "auth.confirm.errorReasonUnknown",
  };
  const reasonText = t(reasonKeyMap[reason]);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md mx-auto">
      <div className="mb-6">
        <div className="w-16 h-16 bg-[#FCEEEA] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-[#C07055]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[#0E0C0A]">{t("auth.confirm.errorTitle")}</h1>
        <p className="text-[#6B6560] mt-3 text-base leading-relaxed">{reasonText}</p>
      </div>

      <div className="space-y-3">
        {/* Reenviar (só faz sentido se temos o email no contexto) */}
        {email && (
          <form action="/api/auth/resend" method="POST">
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              className="block w-full py-3 px-4 bg-[#C07055] text-white font-semibold rounded-lg hover:bg-[#A85D47] transition-colors"
            >
              {t("auth.confirm.actionResend")}
            </button>
          </form>
        )}

        <Link
          href="/login"
          className="block w-full py-3 px-4 bg-white border border-[#E8E0D4] text-[#0E0C0A] font-medium rounded-lg hover:bg-[#F7F4EE] transition-colors"
        >
          {t("auth.confirm.actionLogin")}
        </Link>

        <a
          href="mailto:suporte@kindar.com.br?subject=Não consegui confirmar meu e-mail no Kindar"
          className="block w-full py-3 px-4 text-[#9A8878] font-medium text-sm hover:text-[#C07055] transition-colors"
        >
          {t("auth.confirm.actionSupport")}
        </a>
      </div>
    </div>
  );
}

function isReason(v: string | undefined): v is Reason {
  return v === "expired" || v === "already_used" || v === "invalid" || v === "network" || v === "unknown";
}
