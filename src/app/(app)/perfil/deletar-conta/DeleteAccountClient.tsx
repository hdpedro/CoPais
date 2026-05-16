"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";

interface Props {
  email: string;
  fullName: string | null;
  hasNativeSubscription: boolean;
}

export default function DeleteAccountClient({ email, fullName, hasNativeSubscription }: Props) {
  const { t } = useI18n();
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The required confirmation word is localized per Regra Canônica 1 (Portuguese
  // impecável) but the same KEYWORD per locale — the user types whatever their
  // locale spells. Server accepts either the locale-specific keyword OR the
  // legacy "DELETAR" (kept for back-compat with native callers).
  const requiredKeyword = t("profile.deleteAccount.confirmKeyword");
  const canSubmit = confirm.trim().toUpperCase() === requiredKeyword.toUpperCase() && !submitting;

  const removalList = [
    t("profile.deleteAccount.removalItem1"),
    t("profile.deleteAccount.removalItem2"),
    t("profile.deleteAccount.removalItem3"),
    t("profile.deleteAccount.removalItem4"),
    t("profile.deleteAccount.removalItem5"),
    t("profile.deleteAccount.removalItem6"),
    t("profile.deleteAccount.removalItem7"),
    t("profile.deleteAccount.removalItem8"),
  ];

  async function handleDelete() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Always send the canonical pt keyword to the API so the server's
        // existing confirmation check stays unchanged. UX-side, the user can
        // type their locale's keyword and it's accepted.
        body: JSON.stringify({ confirmation: "DELETAR" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("profile.deleteAccount.errorHttp", { status: res.status }));
      }
      // Account deleted — drop to landing.
      window.location.assign("/?account_deleted=1");
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || t("profile.deleteAccount.errorGeneric"));
      setSubmitting(false);
    }
  }

  const firstName = fullName?.split(" ")[0];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/perfil" className="text-sm text-muted hover:text-dark">
          {t("profile.deleteAccount.backToProfile")}
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-dark">{t("profile.deleteAccount.title")}</h1>
        <p className="text-sm text-muted mt-2">
          {firstName
            ? t("profile.deleteAccount.subtitleNamed", { firstName })
            : t("profile.deleteAccount.subtitleAnon")}
        </p>

        <div className="mt-6 rounded-xl bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700 font-medium">
            {t("profile.deleteAccount.willBeRemoved")}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-red-700 list-disc pl-5">
            {removalList.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {hasNativeSubscription ? (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-800 font-semibold">
              {t("profile.deleteAccount.nativeSubWarningTitle")}
            </p>
            <p
              className="text-sm text-amber-800 mt-1.5"
              dangerouslySetInnerHTML={{ __html: t("profile.deleteAccount.nativeSubWarningBody") }}
            />
          </div>
        ) : null}

        <div className="mt-6">
          <label className="text-sm font-medium text-dark">{t("profile.deleteAccount.emailLabel")}</label>
          <p className="mt-1 text-sm text-muted">{email}</p>
        </div>

        <div className="mt-6">
          <label htmlFor="confirm" className="text-sm font-medium text-dark">
            {t("profile.deleteAccount.confirmPrompt")} <span className="font-mono text-red-600">{requiredKeyword}</span>
          </label>
          <input
            id="confirm"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("profile.deleteAccount.confirmPlaceholder")}
            aria-label={t("profile.deleteAccount.confirmPrompt")}
            className="mt-2 w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-base"
          />
        </div>

        {error ? (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col sm:flex-row sm:justify-end gap-2">
          <Link
            href="/perfil"
            className="inline-flex items-center justify-center px-5 py-3 rounded-lg border border-gray-200 text-sm font-medium text-dark hover:bg-gray-50"
          >
            {t("profile.deleteAccount.cancel")}
          </Link>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleDelete}
            className="inline-flex items-center justify-center px-5 py-3 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t("profile.deleteAccount.deletingButton") : t("profile.deleteAccount.deletePermanent")}
          </button>
        </div>

        <p className="mt-6 text-xs text-muted">
          {t("profile.deleteAccount.supportPrefix")}{" "}
          <Link href="/suporte" className="underline hover:text-dark">
            {t("profile.deleteAccount.supportLink")}
          </Link>{" "}
          {t("profile.deleteAccount.supportSuffix")}
        </p>
      </div>
    </div>
  );
}
