/**
 * Smart-link helpers for `kindar.com.br/baixar` — the single tracked
 * "Baixar o Kindar" link used in social bios (Instagram, etc.).
 *
 * Pure + framework-free so it stays unit-testable and can be shared by
 * the route handler and any future caller. There are no user-visible
 * strings here (the route only redirects), so no i18n applies.
 *
 * Two attribution layers ride along on the redirect:
 *  - iOS  → App Store `ct` (campaign token) → App Store Connect › App Analytics
 *  - Android → Play `referrer` (UTM string) → Play Console › Acquisition
 * The click itself is logged to PostHog by the route so it joins the
 * existing acquisition → activation funnel.
 */

export const APP_STORE_URL =
  "https://apps.apple.com/br/app/kindar/id6762701916";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.kindar.app";

/** PostHog event name for a tracked store-link click. Kept local (not in
 *  the shared EVENTS catalog) because this is a PWA-only marketing event
 *  with no native counterpart — adding it to EVENTS would break the
 *  PWA↔Native analytics-parity test. */
export const STORE_LINK_CLICK_EVENT = "store_link_click";

export type DeviceOs = "ios" | "android" | "desktop";

/**
 * Best-effort OS sniff from a User-Agent string.
 *
 * iPadOS 13+ masquerades as desktop Safari and falls through to
 * "desktop" — acceptable, the homepage shows store badges so the visitor
 * can still reach the App Store.
 */
export function detectDeviceOs(userAgent: string | null | undefined): DeviceOs {
  if (!userAgent) return "desktop";
  const ua = userAgent.toLowerCase();
  // Android UAs also contain "mobile"/"safari", so test Android first.
  if (ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "desktop";
}

export type UtmParams = {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
};

/**
 * Reads `utm_*` from a URLSearchParams, applying neutral defaults so
 * analytics always has a value to group by. The bio link always carries
 * UTMs; the defaults only cover stray/direct hits.
 */
export function parseUtmParams(params: URLSearchParams): UtmParams {
  const get = (key: string): string | undefined => {
    const value = params.get(key);
    return value && value.trim() ? value.trim() : undefined;
  };
  return {
    source: get("utm_source") ?? "direct",
    medium: get("utm_medium") ?? "none",
    campaign: get("utm_campaign") ?? get("utm_source") ?? "none",
    content: get("utm_content"),
    term: get("utm_term"),
  };
}

/**
 * Normalize an explicit platform override (`?p=` / `?platform=`) so a
 * platform-specific post can force a store regardless of the device.
 */
export function parseOsOverride(params: URLSearchParams): DeviceOs | null {
  const raw = (params.get("p") ?? params.get("platform") ?? "")
    .trim()
    .toLowerCase();
  if (raw === "ios" || raw === "iphone" || raw === "apple") return "ios";
  if (raw === "android" || raw === "play") return "android";
  if (raw === "desktop" || raw === "web") return "desktop";
  return null;
}

/** Strip combining accent marks (U+0300–U+036F) after NFD normalization,
 *  e.g. "férias" → "ferias". Char-code filtering keeps this free of
 *  fragile regex literals. */
function foldDiacritics(input: string): string {
  let out = "";
  for (const ch of input.normalize("NFD")) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) continue;
    out += ch;
  }
  return out;
}

/**
 * Apple Campaign token: App Store Connect › App Analytics groups
 * downloads by `ct`. Max 40 chars; keep it URL- and console-friendly.
 */
export function sanitizeCampaignToken(raw: string): string {
  const token = foldDiacritics(raw || "instagram")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, ""); // re-trim if the 40-char cut left a trailing dash
  return token || "link";
}

/** App Store URL tagged with the Apple campaign token (`ct`). */
export function buildAppStoreUrl(utm: UtmParams): string {
  const ct = sanitizeCampaignToken(utm.campaign || utm.source);
  const url = new URL(APP_STORE_URL);
  url.searchParams.set("ct", ct);
  return url.toString();
}

/**
 * Play Store URL with an install `referrer` carrying the UTM string.
 * Delivered to the app via the Play Install Referrer API and shown in
 * Play Console acquisition reports.
 */
export function buildPlayStoreUrl(utm: UtmParams): string {
  const referrer = new URLSearchParams();
  referrer.set("utm_source", utm.source);
  referrer.set("utm_medium", utm.medium);
  referrer.set("utm_campaign", utm.campaign);
  if (utm.content) referrer.set("utm_content", utm.content);
  if (utm.term) referrer.set("utm_term", utm.term);
  const url = new URL(PLAY_STORE_URL);
  url.searchParams.set("referrer", referrer.toString());
  return url.toString();
}

export type Destination = "app_store" | "play_store" | "web";

/**
 * Resolve the redirect target for a device. Desktop visitors land on the
 * homepage (store badges + value prop); UTMs are forwarded so the web
 * funnel attributes the same visit.
 */
export function resolveDestination(
  os: DeviceOs,
  utm: UtmParams,
  origin: string,
): { url: string; destination: Destination } {
  if (os === "ios") {
    return { url: buildAppStoreUrl(utm), destination: "app_store" };
  }
  if (os === "android") {
    return { url: buildPlayStoreUrl(utm), destination: "play_store" };
  }
  const home = new URL("/", origin);
  home.searchParams.set("utm_source", utm.source);
  home.searchParams.set("utm_medium", utm.medium);
  home.searchParams.set("utm_campaign", utm.campaign);
  if (utm.content) home.searchParams.set("utm_content", utm.content);
  return { url: home.toString(), destination: "web" };
}
