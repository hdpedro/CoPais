"use client";

import { useState } from "react";
import Link from "next/link";
import { resetPassword } from "@/actions/auth";
import { useI18n } from "@/i18n/provider";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const result = await resetPassword(formData);
    if (result && "error" in result) {
      setError(result.error);
    } else if (result && "success" in result) {
      setSuccess(result.success);
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#0E0C0A]">{t("auth.forgot.title")}</h1>
        <p className="text-[#9A8878] mt-2 leading-relaxed">{t("auth.forgot.description")}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 mb-4 text-sm" role="status">
          {success}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
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
            autoComplete="email"
            className="w-full px-4 py-3 rounded-lg border border-[#E8E0D4] focus:outline-none focus:ring-2 focus:ring-[#C07055]/40 focus:border-[#C07055] text-[#0E0C0A] bg-white"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-[#C07055] text-white font-semibold rounded-xl hover:bg-[#A85D47] transition-all shadow-md hover:shadow-lg hover:shadow-[#C07055]/25 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
        >
          {loading ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
        </button>
      </form>

      <p className="text-center mt-6 text-sm text-[#9A8878]">
        <Link href="/login" className="text-[#C07055] font-medium hover:underline">
          {t("auth.forgot.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
