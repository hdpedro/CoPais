"use client";

import { useState } from "react";
import { signInWithOAuth } from "@/actions/auth";

interface SocialLoginButtonsProps {
  redirectPath?: string;
  label?: string;
}

/**
 * Botões de login social. Google e Apple visíveis no PWA (Apple Sign In é
 * REQUERIDO pela Apple GR 4.8 sempre que outro provider social aparece).
 * Facebook fica desligado por enquanto — não tem app id configurado.
 */
export default function SocialLoginButtons({ redirectPath, label = "Entrar" }: SocialLoginButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "apple" | "facebook") {
    setLoading(provider);
    setError(null);
    try {
      const result = await signInWithOAuth(provider, redirectPath);
      if (result?.error) {
        setError(result.error);
        setLoading(null);
      }
    } catch {
      // redirect() throws NEXT_REDIRECT, which is expected
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm text-center" role="alert">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={loading !== null}
        aria-label={`${label} com Google`}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-[#E8E0D4] rounded-xl hover:bg-[#F7F4EE] hover:border-[#D4C9B5] transition-all shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
      >
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span className="text-sm font-medium text-[#0E0C0A]">
          {loading === "google" ? "Conectando…" : `${label} com Google`}
        </span>
      </button>

      {/* Apple Sign In — REQUERIDO pela App Store Review Guideline 4.8 sempre
          que outro provider social está presente. Botão preto seguindo HIG
          (Sign in with Apple branding guidelines). */}
      <button
        type="button"
        onClick={() => handleOAuth("apple")}
        disabled={loading !== null}
        aria-label={`${label} com Apple`}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-black text-white rounded-xl hover:bg-[#1a1a1a] transition-all shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
      >
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
        </svg>
        <span className="text-sm font-medium">
          {loading === "apple" ? "Conectando…" : `${label} com Apple`}
        </span>
      </button>
    </div>
  );
}
