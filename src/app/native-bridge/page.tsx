/**
 * Native Bridge — bootstrap de sessão para WebViews do Kindar Native.
 *
 * O native injeta a sessao do Supabase no localStorage do WebView ANTES
 * do carregamento (via WebView.injectedJavaScriptBeforeContentLoaded). Mas
 * o middleware do Next.js roda server-side e checa cookies, nao localStorage.
 * Resultado: navegacao direta para /criancas/[id] → middleware ve sem cookie
 * → redirect pra /login.
 *
 * Esta pagina:
 *   1. Le a sessao do localStorage (chave sb-{project-ref}-auth-token)
 *   2. Chama supabase.auth.setSession() — o ssr browser client escreve os
 *      cookies httpOnly via CookieStore
 *   3. Redireciona para ?next={path}
 *
 * Uso (no WebView do native):
 *   /native-bridge?next=/criancas/abc-123
 *
 * O useEffect roda apos o injectedJavaScriptBeforeContentLoaded, entao o
 * localStorage ja tem o token quando esta pagina monta.
 */

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function getSupabaseProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return url.replace("https://", "").replace(".supabase.co", "");
}

function NativeBridgeInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const next = search.get("next") || "/dashboard";
        const projectRef = getSupabaseProjectRef();
        const key = `sb-${projectRef}-auth-token`;

        const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
        if (!raw) {
          setError("Sessao nao encontrada. Abra pelo app novamente.");
          return;
        }

        let parsed: { access_token?: string; refresh_token?: string } = {};
        try {
          parsed = JSON.parse(raw);
        } catch {
          setError("Sessao invalida.");
          return;
        }

        const { access_token, refresh_token } = parsed;
        if (!access_token || !refresh_token) {
          setError("Tokens ausentes na sessao.");
          return;
        }

        const supabase = createClient();
        const { error: err } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (err) {
          setError(err.message);
          return;
        }

        // Hard redirect so the new cookies apply to the very next request
        if (typeof window !== "undefined") {
          window.location.replace(next);
        } else {
          router.replace(next);
        }
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message || "Erro inesperado";
        setError(msg);
      }
    })();
  }, [router, search]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5EFE6]">
      <div className="text-center p-6">
        {error ? (
          <>
            <p className="text-sm text-red-600 font-medium mb-2">Nao foi possivel abrir</p>
            <p className="text-xs text-[#7A8C8B]">{error}</p>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-[#D4735A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#7A8C8B]">Abrindo...</p>
          </>
        )}
      </div>
    </div>
  );
}

// useSearchParams() requer Suspense boundary no Next 16 pra static prerender.
// Sem isso, `next build` falha com "should be wrapped in a suspense boundary".
// Esse bug travou 6 deploys Vercel seguidos — nenhuma mudanca Apple chegou a
// producao ate esse fix.
export default function NativeBridgePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5EFE6]">
          <div className="text-center p-6">
            <div className="w-8 h-8 border-2 border-[#D4735A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#7A8C8B]">Carregando...</p>
          </div>
        </div>
      }
    >
      <NativeBridgeInner />
    </Suspense>
  );
}
