/**
 * Client-side platform detection — shared between PostHog init (super
 * property) and the `kindar-platform` cookie writer (server-side reads
 * it to stamp `posthog-node` events).
 *
 * CLIENT ONLY. Returns `'web'` if `window` is unavailable.
 */
export function detectClientPlatform(): "pwa" | "web" {
  if (typeof window === "undefined") return "web";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? "pwa" : "web";
}
