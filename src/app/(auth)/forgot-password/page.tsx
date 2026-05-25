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
        <h1 className="text-2xl font-bold text-dark">{t("auth.forgot.title")}</h1>
        <p className="text-muted mt-2">{t("auth.forgot.description")}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-success/20 text-success rounded-lg p-3 mb-4 text-sm">
          {success}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-dark mb-1">
            {t("auth.email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder={t("auth.emailPlaceholder")}
            aria-label={t("auth.email")}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-dark"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
        </button>
      </form>

      <p className="text-center mt-6 text-sm text-muted">
        <Link href="/login" className="text-primary font-medium hover:underline">
          {t("auth.forgot.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
