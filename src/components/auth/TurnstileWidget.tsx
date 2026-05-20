"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget — proteção anti-bot invisível.
 *
 * Sem fricção pra humano: 99.9% dos casos o widget resolve sozinho em
 * background sem mostrar puzzle (managed mode). Apenas tráfego suspeito
 * vê desafio. Padrão "Tier A" SaaS (Stripe, Linear, Cal.com).
 *
 * Defensive: se `NEXT_PUBLIC_TURNSTILE_SITE_KEY` não estiver setada,
 * renderiza um <input hidden name="cf-turnstile-response" value="DEV"> e
 * o server bypassa a validação. Isso permite:
 *   - Deploy do código mesmo antes da chave Cloudflare estar criada
 *   - Dev local sem precisar de chave de teste
 *
 * Quando a env var é setada em produção:
 *   - Script é carregado de challenges.cloudflare.com
 *   - Widget invisível injetado
 *   - Token gerado é enviado como cf-turnstile-response no submit
 *   - Server valida via /siteverify (1RTT até Cloudflare, ~80ms)
 *
 * Documentação Cloudflare: https://developers.cloudflare.com/turnstile/
 */
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "invisible";
          appearance?: "always" | "execute" | "interaction-only";
          action?: string;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface Props {
  /** Telemetria / analytics no Cloudflare; "signup", "login", "magic-link" */
  action: string;
}

export default function TurnstileWidget({ action }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    if (!containerRef.current) return;

    let cancelled = false;

    const ensureScript = (): Promise<void> =>
      new Promise((resolve) => {
        if (window.turnstile) {
          resolve();
          return;
        }
        const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_SRC}"]`);
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.addEventListener("load", () => resolve(), { once: true });
        document.head.appendChild(script);
      });

    ensureScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only", // só mostra se desafio for necessário
          size: "normal",
          theme: "light",
        });
      } catch (err) {
        // Render pode falhar se o container ainda não está no DOM (StrictMode double-mount).
        // O segundo render (cleanup + remount) cobre.
        console.warn("[Turnstile] render failed:", err);
      }
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
      }
    };
  }, [siteKey, action]);

  if (!siteKey) {
    // Sem env var → bypass dev. Server detecta o valor "DEV" e pula validação.
    return <input type="hidden" name="cf-turnstile-response" value="DEV" />;
  }

  return <div ref={containerRef} className="my-2" />;
}
