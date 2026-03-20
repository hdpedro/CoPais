"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Auth error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#FFF9F5] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#1A3B3A]">Erro de autenticacao</h2>
          <p className="text-sm text-[#7A8C8B] mt-1">
            Ocorreu um erro no processo de login. Tente novamente.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-5 py-2 bg-[#E8734A] text-white text-sm font-semibold rounded-lg hover:bg-[#D4633D] transition-colors"
          >
            Tentar novamente
          </button>
          <Link
            href="/login"
            className="px-5 py-2 border border-gray-200 text-sm font-semibold rounded-lg text-[#1A3B3A] hover:bg-gray-50 transition-colors"
          >
            Ir para login
          </Link>
        </div>
      </div>
    </div>
  );
}
