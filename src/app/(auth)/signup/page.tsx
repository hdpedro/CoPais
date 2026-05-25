"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/actions/auth";
import SocialLoginButtons from "@/components/SocialLoginButtons";
import TurnstileWidget from "@/components/auth/TurnstileWidget";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import KindarLogo from "@/components/KindarLogo";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { useI18n } from "@/i18n/provider";

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <p className="text-[#9A8878]" aria-busy="true">
            ...
          </p>
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Validação live: força o meter a re-renderizar a cada keystroke sem
  // precisar do FormData. Confirm-password também usa o mesmo state pra
  // mostrar "as senhas conferem".
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const searchParams = useSearchParams();
  const conviteToken = searchParams.get("convite");
  const refCode = searchParams.get("ref");

  useEffect(() => {
    trackEvent(EVENTS.SIGNUP_STARTED, {
      has_invite: !!conviteToken,
      has_referral: !!refCode,
      ref_code: refCode || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    if (password.length < 8) {
      setError(t("auth.passwordTooShort"));
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordsMismatch"));
      setLoading(false);
      return;
    }

    if (refCode) formData.set("ref", refCode);

    const result = await signUp(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
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
          <p className="text-[#9A8878] text-sm mt-1">{t("auth.invitedSignupHint")}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <SocialLoginButtons
        redirectPath={conviteToken ? `/convite/${conviteToken}` : undefined}
        label={t("auth.createAccount")}
      />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#E8E0D4]" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-[#9A8878]">{t("auth.orEmailSignup")}</span>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-4">
        {conviteToken && <input type="hidden" name="convite" value={conviteToken} />}

        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-[#0E0C0A] mb-1">
            {t("auth.fullName")}
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            placeholder={t("auth.fullNamePlaceholder")}
            aria-label={t("auth.fullName")}
            className="w-full px-4 py-3 rounded-lg border border-[#E8E0D4] focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 focus:border-[#C07055] text-[#0E0C0A] bg-white"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[#0E0C0A] mb-1">
            {t("auth.email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder={t("auth.emailPlaceholder")}
            aria-label={t("auth.email")}
            className="w-full px-4 py-3 rounded-lg border border-[#E8E0D4] focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 focus:border-[#C07055] text-[#0E0C0A] bg-white"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[#0E0C0A] mb-1">
            {t("auth.password")}
          </label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={8}
            placeholder={t("auth.passwordMinLength")}
            aria-label={t("auth.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#0E0C0A] mb-1">
            {t("auth.confirmPassword")}
          </label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            required
            minLength={8}
            placeholder={t("auth.confirmPasswordPlaceholder")}
            aria-label={t("auth.confirmPassword")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          {confirmPassword && (
            <p
              className={`text-xs mt-1.5 font-medium ${
                password === confirmPassword ? "text-[#2E7268]" : "text-amber-700"
              }`}
              aria-live="polite"
            >
              {password === confirmPassword
                ? t("auth.passwordStrength.matchOk")
                : t("auth.passwordStrength.matchFail")}
            </p>
          )}
        </div>

        <div className="flex items-start gap-2.5 pt-1">
          <input
            id="lgpd"
            name="lgpd"
            type="checkbox"
            required
            className="mt-0.5 h-[18px] w-[18px] rounded border-[#E8E0D4] text-[#C07055] focus:ring-2 focus:ring-[#C07055]/40 accent-[#C07055] cursor-pointer flex-shrink-0"
          />
          <label htmlFor="lgpd" className="text-[13px] text-[#6B5F52] leading-relaxed cursor-pointer">
            {t("auth.lgpdConsentPrefix")}{" "}
            <Link href="/termos" className="text-[#C07055] hover:underline font-medium">
              {t("auth.termsOfUse")}
            </Link>{" "}
            {t("auth.lgpdConsentMiddle")}{" "}
            <Link href="/privacidade" className="text-[#C07055] hover:underline font-medium">
              {t("auth.privacyPolicy")}
            </Link>
            {t("auth.lgpdConsentSuffix")}
          </label>
        </div>

        {/* Cloudflare Turnstile invisível — bloqueia bot abuse sem fricção pra humano */}
        <TurnstileWidget action="signup" />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-[#C07055] text-white font-semibold rounded-xl hover:bg-[#A85D47] transition-all shadow-md hover:shadow-lg hover:shadow-[#C07055]/25 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
        >
          {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
        </button>
      </form>

      <p className="text-center mt-6 text-sm text-[#9A8878]">
        {t("auth.hasAccount")}{" "}
        <Link
          href={conviteToken ? `/login?convite=${conviteToken}` : "/login"}
          className="text-[#C07055] font-medium hover:underline"
        >
          {t("auth.loginButton")}
        </Link>
      </p>
    </div>
  );
}
