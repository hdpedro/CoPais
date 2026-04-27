"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getPostHogClient } from "@/lib/posthog";

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
