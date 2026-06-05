"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { isChunkLoadError, reloadForChunkError } from "@/components/ChunkReloadGuard";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Deploy skew: chunk antigo sumiu apos novo deploy. reset() nao resolve
    // (o chunk continua ausente) — so um reload busca o deploy novo.
    if (isChunkLoadError(error)) {
      reloadForChunkError();
      return;
    }
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gray-50 text-[#1a3b3a]">
      <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-sm">
        <div className="text-5xl mb-4">&#x26A0;&#xFE0F;</div>
        <h2 className="text-xl font-bold mb-2">Algo deu errado</h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Ocorreu um erro inesperado. Tente recarregar a p&aacute;gina.
        </p>
        <button
          onClick={reset}
          className="w-full bg-[#1a3b3a] text-white rounded-lg py-3 px-6 font-semibold text-sm hover:bg-[#244e4d] transition-colors cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
