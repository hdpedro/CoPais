"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { resendConfirmation, sendMagicLink, signInWithOAuth } from "@/actions/auth";

interface Props {
  initialEmail: string;
  initialError: string | null;
  initialResent: boolean;
}

/**
 * /verify-email — UI premium pós-signup.
 *
 * Comportamento Tier A:
 *
 *  1. **Polling auto-redirect** — fetch `/api/auth/status?email=...` a cada
 *     4s. Se `confirmed: true` (user clicou link em qualquer device),
 *     mostra check verde + redireciona pra /dashboard em 1.2s.
 *
 *  2. **Deep link pro inbox** — detecta provedor pelo domínio (Gmail,
 *     Outlook, iCloud, Yahoo) e mostra botão grande "Abrir Gmail" que
 *     leva direto pra inbox.
 *
 *  3. **Reenviar** — chama `resendConfirmation` action via form. Countdown
 *     60s visível (rate limit do Supabase).
 *
 *  4. **Mudar e-mail** — link "Mudar e-mail" volta pra /signup.
 *
 *  5. **Magic Link inline** — botão "Receber link sem senha" como segunda
 *     forma de entrar quando user trava no confirm flow (chama
 *     `sendMagicLink`).
 *
 *  6. **OAuth fallback** — botão "Entrar com Google/Apple". Resolve 100%
 *     dos casos onde email confirm não funciona (apple_iap users, etc).
 *
 *  7. **Suporte** — link mailto:suporte@kindar.com.br como último recurso.
 *
 * Acessibilidade: aria-live no banner de status pra leitores de tela
 * narrarem quando confirmar.
 */
const POLL_INTERVAL_MS = 4000;
const RESEND_COOLDOWN_S = 60;

export default function VerifyEmailClient({ initialEmail, initialError, initialResent }: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [email] = useState<string>(initialEmail);
  const [confirmed, setConfirmed] = useState(false);
  const [showAlternative, setShowAlternative] = useState(false);
  const [magicLinkMode, setMagicLinkMode] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Resend state
  const [resendCooldown, setResendCooldown] = useState<number>(initialResent ? RESEND_COOLDOWN_S : 0);
  const [resendSuccess, setResendSuccess] = useState<boolean>(initialResent);
  const [resendError, setResendError] = useState<string | null>(initialError);
  const [isResending, startResend] = useTransition();
  const [isSendingMagic, startMagicLink] = useTransition();

  // form_submit — dispara ao CHEGAR nesta tela (= cadastro concluído, agora
  // aguardando confirmação de e-mail). É o sinal de conversão "formulário de
  // signup submetido" que a Escala/Google Ads rastreia. Guard por
  // sessionStorage pra não duplicar em reloads da mesma sessão.
  const formSubmitFiredRef = useRef(false);
  useEffect(() => {
    if (!email || formSubmitFiredRef.current) return;
    formSubmitFiredRef.current = true;
    const storageKey = `kindar_form_submit_${email}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // sessionStorage indisponível — dispara mesmo assim
    }
    trackEvent(EVENTS.FORM_SUBMIT, { form_type: "signup" });
  }, [email]);

  // Polling (auto-redirect quando user confirma em outro device)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!email || confirmed) return;
    const tick = async () => {
      try {
        const res = await fetch(`/api/auth/status?email=${encodeURIComponent(email)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.confirmed) {
          setConfirmed(true);
          setTimeout(() => router.push("/dashboard"), 1200);
        }
      } catch {
        // network blip, próximo tick
      }
    };
    void tick();
    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [email, confirmed, router]);

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const inboxAction = detectInbox(email);

  const handleResend = () => {
    if (resendCooldown > 0 || !email) return;
    const fd = new FormData();
    fd.set("email", email);
    startResend(async () => {
      const result = await resendConfirmation(fd);
      if (result && "error" in result) {
        setResendError(result.error);
        setResendSuccess(false);
      } else {
        setResendError(null);
        setResendSuccess(true);
        setResendCooldown(RESEND_COOLDOWN_S);
      }
    });
  };

  const handleMagicLink = () => {
    if (!email) return;
    const fd = new FormData();
    fd.set("email", email);
    startMagicLink(async () => {
      const result = await sendMagicLink(fd);
      if (result && "error" in result) {
        setResendError(result.error);
      } else {
        setMagicLinkSent(true);
        setResendError(null);
      }
    });
  };

  const handleOAuth = (provider: "google") => {
    void signInWithOAuth(provider);
  };

  // ====================== Render ======================

  if (confirmed) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center" role="status" aria-live="polite">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[#0E0C0A]">{t("auth.confirm.successTitle")}</h1>
        <p className="text-[#6B6560] mt-3">{t("auth.confirm.successDescription")}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-[#FCEEEA] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#C07055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79V19a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h7" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6 4-2.6" />
            <circle cx="18" cy="6" r="3" fill="currentColor" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[#0E0C0A]">{t("auth.verifyEmail.titlePending")}</h1>
        <p className="text-[#6B6560] mt-3 text-base leading-relaxed">
          {email
            ? t("auth.verifyEmail.descriptionPending", { email })
            : t("auth.verifyEmail.description")}
        </p>
      </div>

      {/* Realtime polling status banner */}
      {email && (
        <div
          className="bg-[#F7F4EE] border border-[#E8E0D4] rounded-lg px-4 py-3 mb-4 text-sm text-[#6B6560] flex items-center gap-3"
          aria-live="polite"
        >
          <div className="w-2 h-2 bg-[#C07055] rounded-full animate-pulse" aria-hidden="true" />
          <span>{t("auth.verifyEmail.realtimeWaiting")}</span>
        </div>
      )}

      {/* Open inbox CTA */}
      {inboxAction && (
        <a
          href={inboxAction.href}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-3 px-4 bg-[#C07055] text-white font-semibold rounded-lg hover:bg-[#A85D47] transition-colors text-center mb-3"
        >
          {t(inboxAction.labelKey)}
        </a>
      )}

      {/* Resend */}
      <div className="mb-3">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || isResending || !email}
          className="w-full py-3 px-4 bg-white border border-[#E8E0D4] text-[#0E0C0A] font-medium rounded-lg hover:bg-[#F7F4EE] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isResending
            ? t("auth.verifyEmail.resending")
            : resendCooldown > 0
              ? t("auth.verifyEmail.resendCooldown", { seconds: resendCooldown })
              : t("auth.verifyEmail.resend")}
        </button>
        {resendSuccess && resendCooldown > 0 && (
          <p className="text-xs text-green-700 mt-2 text-center" role="status">
            {t("auth.verifyEmail.resendSent")}
          </p>
        )}
        {resendError && (
          <p className="text-xs text-[#C07055] mt-2 text-center" role="alert">
            {resendError}
          </p>
        )}
      </div>

      {/* Mudar e-mail (link discreto) */}
      <div className="text-center mb-6">
        <Link href="/signup" className="text-sm text-[#9A8878] hover:text-[#C07055] hover:underline">
          {t("auth.verifyEmail.changeEmail")}
        </Link>
      </div>

      {/* Alternativas (expansível) */}
      <div className="border-t border-[#E8E0D4] pt-4">
        <button
          type="button"
          onClick={() => setShowAlternative((s) => !s)}
          className="w-full text-sm text-[#9A8878] hover:text-[#C07055] flex items-center justify-between"
          aria-expanded={showAlternative}
        >
          <span>{t("auth.verifyEmail.alternativeTitle")}</span>
          <span aria-hidden="true">{showAlternative ? "−" : "+"}</span>
        </button>

        {showAlternative && (
          <div className="mt-4 space-y-3">
            {magicLinkMode ? (
              magicLinkSent ? (
                <p className="text-sm text-green-700 bg-green-50 rounded-lg p-3 text-center" role="status">
                  {t("auth.login.magicLink.sent", { email })}
                </p>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleMagicLink}
                    disabled={isSendingMagic || !email}
                    className="w-full py-2.5 px-4 bg-white border border-[#C07055] text-[#C07055] font-medium rounded-lg hover:bg-[#FCEEEA] transition-colors disabled:opacity-60"
                  >
                    {isSendingMagic ? t("auth.login.magicLink.sending") : t("auth.login.magicLink.send")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMagicLinkMode(false)}
                    className="w-full text-xs text-[#9A8878] hover:text-[#C07055]"
                  >
                    {t("auth.login.magicLink.back")}
                  </button>
                </div>
              )
            ) : (
              <button
                type="button"
                onClick={() => setMagicLinkMode(true)}
                className="w-full py-2.5 px-4 bg-white border border-[#E8E0D4] text-[#0E0C0A] text-sm font-medium rounded-lg hover:bg-[#F7F4EE] transition-colors"
              >
                {t("auth.verifyEmail.alternativeMagicLink")}
              </button>
            )}

            <button
              type="button"
              onClick={() => handleOAuth("google")}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border border-[#E8E0D4] text-[#0E0C0A] text-sm font-medium rounded-lg hover:bg-[#F7F4EE] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>{t("auth.verifyEmail.alternativeSocial")}</span>
            </button>
          </div>
        )}
      </div>

      {/* Suporte */}
      <div className="text-center mt-6 pt-4 border-t border-[#E8E0D4]">
        <a
          href={`mailto:suporte@kindar.com.br?subject=${encodeURIComponent("Preciso de ajuda no Kindar")}`}
          className="text-xs text-[#9A8878] hover:text-[#C07055]"
        >
          {t("auth.verifyEmail.support")}
        </a>
      </div>
    </div>
  );
}

// ====================== Helpers ======================

interface InboxAction {
  href: string;
  labelKey: string;
}

function detectInbox(email: string): InboxAction | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (/^(gmail\.com|googlemail\.com)$/.test(domain)) {
    return { href: "https://mail.google.com/mail/u/0/#inbox", labelKey: "auth.verifyEmail.openGmail" };
  }
  if (/^(outlook\.com|hotmail\.com|live\.com|msn\.com)$/.test(domain)) {
    return { href: "https://outlook.live.com/mail/0/inbox", labelKey: "auth.verifyEmail.openOutlook" };
  }
  if (/^(icloud\.com|me\.com|mac\.com)$/.test(domain)) {
    return { href: "https://www.icloud.com/mail", labelKey: "auth.verifyEmail.openICloud" };
  }
  if (/^(yahoo\.com|yahoo\.com\.br|ymail\.com)$/.test(domain)) {
    return { href: "https://mail.yahoo.com", labelKey: "auth.verifyEmail.openYahoo" };
  }
  return { href: "mailto:", labelKey: "auth.verifyEmail.openMail" };
}
