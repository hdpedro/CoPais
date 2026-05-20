"use client";

import { useState, useEffect, useRef, Suspense, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, sendMagicLink } from "@/actions/auth";
import SocialLoginButtons from "@/components/SocialLoginButtons";
import TurnstileWidget from "@/components/auth/TurnstileWidget";
import KindarLogo from "@/components/KindarLogo";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/provider";
import type { Session } from "@supabase/supabase-js";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center min-h-[500px] flex items-center justify-center">
          <p className="text-muted" aria-busy="true">
            ...
          </p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const conviteToken = searchParams.get("convite");
  const urlError = searchParams.get("error");

  const [error, setError] = useState<string | null>(
    urlError && urlError !== "auth"
      ? decodeURIComponent(urlError)
      : urlError === "auth"
        ? t("auth.authError")
        : null,
  );
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Magic link state
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState<string | null>(null); // email enviado
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);
  const [isSendingMagic, startMagic] = useTransition();

  // Check if user already has a session (e.g. navigated here directly while logged in)
  useEffect(() => {
    const supabase = createClient();
    const dest = conviteToken ? `/convite/${conviteToken}` : "/dashboard";

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      if (session?.user) {
        router.replace(dest);
        return;
      }
      setChecking(false);
    });
  }, [router, conviteToken]);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await signIn(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    if (!result?.error && conviteToken) {
      window.location.href = `/convite/${conviteToken}`;
    }
  }

  function handleMagicLink() {
    const email = emailInputRef.current?.value?.trim() ?? "";
    if (!email) {
      setMagicLinkError(t("validation.field.emailRequired"));
      return;
    }
    setMagicLinkError(null);
    const fd = new FormData();
    fd.set("email", email);
    // Turnstile token presente no form principal já passou pelo widget
    const tsInput = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
    if (tsInput?.value) fd.set("cf-turnstile-response", tsInput.value);
    startMagic(async () => {
      const result = await sendMagicLink(fd);
      if (result?.error) {
        setMagicLinkError(result.error);
      } else {
        setMagicLinkSent(email);
      }
    });
  }

  if (checking) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center min-h-[500px] flex items-center justify-center">
        <p className="text-muted">{t("auth.loading")}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="flex flex-col items-center mb-8">
        <KindarLogo size={64} background="sand" />
        <h1 className="mt-4 text-2xl font-light text-[#0E0C0A] tracking-tight">Kindar</h1>
        <p className="mt-1 text-xs text-[#9A8878] tracking-widest uppercase">
          {t("auth.tagline")}
        </p>
      </div>

      {conviteToken && (
        <div className="text-center mb-6">
          <p className="text-[#C07055] font-medium">{t("auth.invited")}</p>
          <p className="text-[#9A8878] text-sm mt-1">{t("auth.invitedLoginHint")}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <SocialLoginButtons
        redirectPath={conviteToken ? `/convite/${conviteToken}` : undefined}
        label={t("auth.loginButton")}
      />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#E8E0D4]" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-[#9A8878]">{t("auth.orEmailLogin")}</span>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-4">
        {conviteToken && <input type="hidden" name="convite" value={conviteToken} />}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[#0E0C0A] mb-1">
            {t("auth.email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            ref={emailInputRef}
            placeholder={t("auth.emailPlaceholder")}
            aria-label={t("auth.email")}
            className="w-full px-4 py-3 rounded-lg border border-[#E8E0D4] focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 focus:border-[#C07055] text-[#0E0C0A] bg-white"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[#0E0C0A] mb-1">
            {t("auth.password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder={t("auth.passwordPlaceholder")}
            aria-label={t("auth.password")}
            className="w-full px-4 py-3 rounded-lg border border-[#E8E0D4] focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 focus:border-[#C07055] text-[#0E0C0A] bg-white"
          />
        </div>

        <div className="flex items-center justify-between">
          <label htmlFor="rememberMe" className="flex items-center gap-2 cursor-pointer select-none">
            <input
              id="rememberMe"
              name="rememberMe"
              type="checkbox"
              defaultChecked
              className="h-4 w-4 rounded border-[#E8E0D4] text-[#C07055] focus:ring-[#C07055]/40 accent-[#C07055]"
            />
            <span className="text-sm text-[#2C2C2C]">{t("auth.rememberMe")}</span>
          </label>
          <Link href="/forgot-password" className="text-sm text-[#C07055] hover:underline">
            {t("auth.forgotPassword")}
          </Link>
        </div>

        {/* Turnstile invisível — gera token pro signIn E pro magic link (mesma página) */}
        <TurnstileWidget action="login" />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-[#C07055] text-white font-semibold rounded-lg hover:bg-[#A85D47] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t("auth.loggingIn") : t("auth.loginButton")}
        </button>
      </form>

      {/* Magic Link — segunda opção, fora do form principal */}
      <div className="mt-4">
        {magicLinkSent ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 text-center" role="status">
            {t("auth.login.magicLink.sent", { email: magicLinkSent })}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={isSendingMagic}
              className="w-full py-3 px-4 bg-white border border-[#E8E0D4] text-[#0E0C0A] font-medium rounded-lg hover:bg-[#F7F4EE] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 text-[#C07055]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M3 8v10a2 2 0 002 2h14a2 2 0 002-2V8M3 8l9-6 9 6" />
              </svg>
              {isSendingMagic ? t("auth.login.magicLink.sending") : t("auth.login.magicLink.toggle")}
            </button>
            {magicLinkError && (
              <p className="text-xs text-[#C07055] mt-2 text-center" role="alert">
                {magicLinkError}
              </p>
            )}
          </>
        )}
      </div>

      <p className="text-center mt-6 text-sm text-[#9A8878]">
        {t("auth.noAccount")}{" "}
        <Link
          href={conviteToken ? `/signup?convite=${conviteToken}` : "/signup"}
          className="text-[#C07055] font-medium hover:underline"
        >
          {t("auth.createAccountLink")}
        </Link>
      </p>
    </div>
  );
}
