"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getPostHogClient } from "@/lib/posthog";
import { detectClientPlatform } from "@/lib/platform";
import { ATTRIBUTION_COOKIE } from "@/lib/attribution";

/**
 * Writes the `kindar-platform` cookie used by `posthog-server` to stamp
 * server-side events. Idempotent — re-set on every route so the value
 * stays accurate if the user installs the PWA mid-session.
 */
function syncPlatformCookie() {
  if (typeof document === "undefined") return;
  const platform = detectClientPlatform();
  // 1 year, root path, lax — readable by Server Actions via cookies()
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `kindar-platform=${platform}; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
}

/**
 * Marketing attribution (first-touch). Grava o cookie `kindar-attribution` na
 * PRIMEIRA visita com sinal de aquisição (utm_* na URL ou referrer externo).
 * Lido server-side no cadastro (signUp + OAuth) → persistido em
 * `profiles.first_touch_utm` → carimbado nos eventos de conversão. É o que
 * liga "veio do Instagram" a "cadastrou" e "pagou" sem depender de stitching.
 *
 * First-touch: NÃO sobrescreve um cookie existente. Assim o primeiro toque
 * (geralmente o anúncio) vence, mesmo que o user volte depois por outro canal.
 */
function captureFirstTouch(
  searchParams: ReturnType<typeof useSearchParams>,
  pathname: string | null,
) {
  if (typeof document === "undefined") return;
  // First-touch — preserva o cookie já existente.
  if (document.cookie.includes(`${ATTRIBUTION_COOKIE}=`)) return;

  const get = (k: string) => searchParams?.get(k) || null;
  const utmSource = get("utm_source");
  const utmCampaign = get("utm_campaign");

  let referrer: string | null = null;
  try {
    referrer = document.referrer ? new URL(document.referrer).hostname : null;
  } catch {
    referrer = null;
  }
  // Referrer do próprio domínio não é aquisição — ignora pra deixar uma visita
  // externa posterior vencer o first-touch.
  if (referrer && /(^|\.)kindar\.com\.br$/.test(referrer)) referrer = null;

  // Sem nenhum sinal real, não grava — uma visita taggeada futura pode vencer.
  if (!utmSource && !utmCampaign && !referrer) return;

  const attribution = {
    source: utmSource,
    medium: get("utm_medium"),
    campaign: utmCampaign,
    content: get("utm_content"),
    term: get("utm_term"),
    referrer,
    landing: pathname || null,
    ts: new Date().toISOString(),
  };
  const value = encodeURIComponent(JSON.stringify(attribution));
  const ninetyDays = 60 * 60 * 24 * 90;
  document.cookie = `${ATTRIBUTION_COOKIE}=${value}; Max-Age=${ninetyDays}; Path=/; SameSite=Lax`;
}

/**
 * Boots PostHog for ANONYMOUS visitors (landing, pricing, /r/[code]).
 *
 * The authenticated PostHogProvider in (app)/layout handles identify +
 * pageview tracking once the user logs in. For visitors not yet logged
 * in, this component:
 *   1. Initializes the client so trackEvent() calls work
 *   2. Captures $pageview on route change
 *   3. Resets the PostHog identity if the URL carries `?logout=1` —
 *      ensures the next visitor on the same browser doesn't inherit
 *      the previous user's identity and feature-flag bucket.
 */
export default function PostHogAnonymousInit() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Keep the platform cookie fresh on every route so server-side
    // events have the right value even if the user just installed the PWA.
    syncPlatformCookie();

    const posthog = getPostHogClient();
    if (!posthog) return;

    // Reset on logout — the signOut server action redirects to
    // /login?logout=1 so we know to forget the previous user here.
    if (searchParams?.get("logout") === "1") {
      try {
        posthog.reset();
      } catch {
        /* swallow */
      }
    }
  }, [searchParams]);

  // First-touch attribution — grava o cookie de origem (utm_*/referrer) na
  // primeira visita com sinal de aquisição. Roda em TODA rota (inclusive a
  // landing onde o clique do Instagram cai); self-guard preserva o primeiro
  // toque. Lido server-side no cadastro pra carimbar a conversão.
  useEffect(() => {
    captureFirstTouch(searchParams, pathname);
  }, [pathname, searchParams]);

  // Track page views for anonymous routes. The authenticated provider
  // does the same thing inside (app)/, so we exclude that prefix to
  // avoid duplicate captures.
  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/calendario")) {
      // Inside the (app) group — let PostHogProvider handle it.
      return;
    }
    const posthog = getPostHogClient();
    if (!posthog) return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
