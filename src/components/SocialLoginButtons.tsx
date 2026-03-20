"use client";

import { useState } from "react";
import { signInWithOAuth } from "@/actions/auth";

interface SocialLoginButtonsProps {
  redirectPath?: string;
  label?: string;
}

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
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 text-sm text-center">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={loading !== null}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span className="text-sm font-medium text-dark">
          {loading === "google" ? "Conectando..." : `${label} com Google`}
        </span>
      </button>

      {/* Apple e Facebook desativados por enquanto - ativar quando configurar os providers
      <button
        type="button"
        onClick={() => handleOAuth("apple")}
        disabled={loading !== null}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-black text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
        </svg>
        <span className="text-sm font-medium">
          {loading === "apple" ? "Conectando..." : `${label} com Apple`}
        </span>
      </button>

      <button
        type="button"
        onClick={() => handleOAuth("facebook")}
        disabled={loading !== null}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-[#1877F2] text-white rounded-lg hover:bg-[#166FE5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
        <span className="text-sm font-medium">
          {loading === "facebook" ? "Conectando..." : `${label} com Facebook`}
        </span>
      </button>
      */}
    </div>
  );
}
