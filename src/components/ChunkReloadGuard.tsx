"use client";

import { useEffect } from "react";

/**
 * Detecta ChunkLoadError — o erro classico de "deploy skew": depois de um deploy
 * novo, os chunks JS sao re-hasheados; um cliente com a pagina antiga aberta pede
 * um chunk que nao existe mais -> 404 -> ChunkLoadError. Cobre as variantes de
 * mensagem do webpack/turbopack + falha de import() de module script.
 */
export function isChunkLoadError(reason: unknown): boolean {
  if (!reason) return false;
  const name = reason instanceof Error ? reason.name : "";
  const msg = reason instanceof Error ? reason.message : String(reason);
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to load chunk/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

const RELOAD_TS_KEY = "kindar-chunk-reload-ts";

/**
 * Recarrega a pagina UMA vez pra buscar o deploy novo (HTML fresco -> chunks
 * novos; o service worker e network-first em navigate, entao nao serve HTML
 * velho de cache). Guarda anti-loop: se um chunk error voltar < 10s depois de um
 * reload, NAO recarrega de novo (provavelmente bug real, nao skew de deploy) e
 * deixa o error boundary aparecer em vez de prender o usuario num loop.
 */
export function reloadForChunkError(): void {
  if (typeof window === "undefined") return;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_TS_KEY) || "0");
    if (Date.now() - last < 10_000) return;
    window.sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
  } catch {
    // sessionStorage indisponivel (modo privado raro): segue com o reload — o
    // risco de loop e baixo e o ChunkLoadError travado e pior.
  }
  window.location.reload();
}

/**
 * Listener global de ChunkLoadError. Um import() dinamico que falha chega como
 * `unhandledrejection` (vide o stack "at async Promise.all" do erro reportado),
 * que NAO passa pelo error boundary do React — por isso o listener de window e
 * necessario. Montado uma vez no root layout. Renderiza null.
 */
export default function ChunkReloadGuard() {
  useEffect(() => {
    function onRejection(e: PromiseRejectionEvent) {
      if (isChunkLoadError(e.reason)) {
        e.preventDefault();
        reloadForChunkError();
      }
    }
    function onError(e: ErrorEvent) {
      if (isChunkLoadError(e.error ?? e.message)) {
        reloadForChunkError();
      }
    }
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}
