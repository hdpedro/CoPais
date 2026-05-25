"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updatePassword } from "@/actions/auth";
import PasswordInput from "@/components/auth/PasswordInput";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { useI18n } from "@/i18n/provider";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  // Live validation: meter + match indicator precisam re-render no keystroke.
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "PASSWORD_RECOVERY") {
        setChecking(false);
      } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        setChecking(false);
      }
    });

    // Fallback: if no auth event fires within 2s, check session directly.
    const timeout = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setChecking(false);
      } else {
        router.push("/forgot-password");
      }
    }, 2000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError(t("auth.passwordsMismatch"));
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError(t("auth.passwordTooShort"));
      setLoading(false);
      return;
    }

    const result = await updatePassword(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
        <p className="text-[#9A8878]" aria-busy="true">{t("auth.reset.checking")}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#0E0C0A]">{t("auth.reset.title")}</h1>
        <p className="text-[#9A8878] mt-2 leading-relaxed">{t("auth.reset.description")}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm" role="alert">
          {error}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[#0E0C0A] mb-1">
            {t("auth.reset.newPasswordLabel")}
          </label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={8}
            placeholder={t("auth.reset.newPasswordPlaceholder")}
            aria-label={t("auth.reset.newPasswordLabel")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#0E0C0A] mb-1">
            {t("auth.reset.confirmLabel")}
          </label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            required
            minLength={8}
            placeholder={t("auth.reset.confirmPlaceholder")}
            aria-label={t("auth.reset.confirmLabel")}
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

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-[#C07055] text-white font-semibold rounded-xl hover:bg-[#A85D47] transition-all shadow-md hover:shadow-lg hover:shadow-[#C07055]/25 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
        >
          {loading ? t("auth.reset.submitting") : t("auth.reset.submit")}
        </button>
      </form>
    </div>
  );
}
