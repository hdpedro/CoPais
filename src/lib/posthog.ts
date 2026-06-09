import posthog from "posthog-js";
import { detectClientPlatform } from "./platform";

export function getPostHogClient() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!key || typeof window === "undefined") return null;

  if (!posthog.__loaded) {
    posthog.init(key, {
      api_host: host,
      person_profiles: "identified_only",
      capture_pageview: false, // We handle this manually in the provider
      capture_pageleave: true,
      respect_dnt: true,
      // Inject posthog's lazily-loaded extension scripts (recorder, surveys,
      // web-vitals…) into <head> instead of as a direct child of <body>.
      // The Next.js App Router hydrates <body>, so a foreign <script> appended
      // there by posthog races hydration and throws React #418 (hydration
      // mismatch) intermittently across pages. PostHog documents 'head' as the
      // fix for SSR hydration errors (it becomes the default in their
      // 2026-01-30 preset). Capture / feature flags / replay behavior is
      // unchanged — only the DOM injection target moves.
      external_scripts_inject_target: "head",
    });
    // Super-property: stamps every subsequent event with the current
    // platform. Single source of truth for the DAU/MAU breakdown.
    posthog.register({ platform: detectClientPlatform() });
  }

  return posthog;
}
