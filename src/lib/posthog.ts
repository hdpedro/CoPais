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
    });
    // Super-property: stamps every subsequent event with the current
    // platform. Single source of truth for the DAU/MAU breakdown.
    posthog.register({ platform: detectClientPlatform() });
  }

  return posthog;
}
