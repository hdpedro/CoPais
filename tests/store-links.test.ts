import { describe, it, expect } from "vitest";
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  detectDeviceOs,
  parseUtmParams,
  parseOsOverride,
  sanitizeCampaignToken,
  buildAppStoreUrl,
  buildPlayStoreUrl,
  resolveDestination,
  type UtmParams,
} from "@/lib/store-links";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
// Instagram in-app browser on iOS still carries "iPhone".
const INSTAGRAM_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 330.0.0 (iPhone; iOS 17_5; pt_BR)";

const utm = (over: Partial<UtmParams> = {}): UtmParams => ({
  source: "instagram",
  medium: "bio",
  campaign: "reel-rotina",
  ...over,
});

describe("detectDeviceOs", () => {
  it("detects iOS from iPhone/iPad/iPod", () => {
    expect(detectDeviceOs(IPHONE_UA)).toBe("ios");
    expect(detectDeviceOs("something iPad something")).toBe("ios");
    expect(detectDeviceOs(INSTAGRAM_IOS_UA)).toBe("ios");
  });

  it("detects Android (even though the UA also says Safari/Mobile)", () => {
    expect(detectDeviceOs(ANDROID_UA)).toBe("android");
  });

  it("falls back to desktop for desktop UAs, null, or empty", () => {
    expect(detectDeviceOs(DESKTOP_UA)).toBe("desktop");
    expect(detectDeviceOs(null)).toBe("desktop");
    expect(detectDeviceOs(undefined)).toBe("desktop");
    expect(detectDeviceOs("")).toBe("desktop");
  });
});

describe("parseUtmParams", () => {
  it("reads utm_* and trims", () => {
    const p = new URLSearchParams(
      "utm_source=instagram&utm_medium=reel&utm_campaign=%20rotina%20&utm_content=cta1&utm_term=foo",
    );
    expect(parseUtmParams(p)).toEqual({
      source: "instagram",
      medium: "reel",
      campaign: "rotina",
      content: "cta1",
      term: "foo",
    });
  });

  it("applies neutral defaults and falls campaign back to source", () => {
    expect(parseUtmParams(new URLSearchParams(""))).toEqual({
      source: "direct",
      medium: "none",
      campaign: "none",
      content: undefined,
      term: undefined,
    });
    expect(parseUtmParams(new URLSearchParams("utm_source=tiktok"))).toMatchObject({
      source: "tiktok",
      campaign: "tiktok",
    });
  });
});

describe("parseOsOverride", () => {
  it("maps aliases to a device and returns null when absent/unknown", () => {
    expect(parseOsOverride(new URLSearchParams("p=ios"))).toBe("ios");
    expect(parseOsOverride(new URLSearchParams("p=iPhone"))).toBe("ios");
    expect(parseOsOverride(new URLSearchParams("platform=android"))).toBe("android");
    expect(parseOsOverride(new URLSearchParams("p=web"))).toBe("desktop");
    expect(parseOsOverride(new URLSearchParams(""))).toBeNull();
    expect(parseOsOverride(new URLSearchParams("p=windowsphone"))).toBeNull();
  });
});

describe("sanitizeCampaignToken", () => {
  it("lowercases, slugs unsafe chars, trims dashes, caps at 40", () => {
    expect(sanitizeCampaignToken("Reel Rotina!! Jun")).toBe("reel-rotina-jun");
    expect(sanitizeCampaignToken("Rotina-Férias")).toBe("rotina-ferias");
    expect(sanitizeCampaignToken("--já_é_assim--")).toBe("ja_e_assim");
    expect(sanitizeCampaignToken("a".repeat(60)).length).toBe(40);
  });

  it("never returns empty", () => {
    expect(sanitizeCampaignToken("")).toBe("instagram");
    expect(sanitizeCampaignToken("!!!")).toBe("link");
  });
});

describe("buildAppStoreUrl", () => {
  it("tags the App Store URL with a campaign token", () => {
    const u = new URL(buildAppStoreUrl(utm({ campaign: "Reel Rotina" })));
    expect(`${u.origin}${u.pathname}`).toBe(APP_STORE_URL);
    expect(u.searchParams.get("ct")).toBe("reel-rotina");
  });
});

describe("buildPlayStoreUrl", () => {
  it("carries the UTM string inside the install referrer", () => {
    const u = new URL(buildPlayStoreUrl(utm({ campaign: "reel-rotina" })));
    expect(u.searchParams.get("id")).toBe("com.kindar.app");
    const referrer = new URLSearchParams(u.searchParams.get("referrer") ?? "");
    expect(referrer.get("utm_source")).toBe("instagram");
    expect(referrer.get("utm_medium")).toBe("bio");
    expect(referrer.get("utm_campaign")).toBe("reel-rotina");
  });
});

describe("resolveDestination", () => {
  const origin = "https://www.kindar.com.br";

  it("routes iOS to the App Store", () => {
    const r = resolveDestination("ios", utm(), origin);
    expect(r.destination).toBe("app_store");
    expect(r.url).toContain(APP_STORE_URL);
    expect(r.url).toContain("ct=reel-rotina");
  });

  it("routes Android to the Play Store", () => {
    const r = resolveDestination("android", utm(), origin);
    expect(r.destination).toBe("play_store");
    expect(r.url).toContain(PLAY_STORE_URL);
    expect(r.url).toContain("referrer=");
  });

  it("routes desktop to the homepage with UTMs forwarded", () => {
    const r = resolveDestination("desktop", utm(), origin);
    expect(r.destination).toBe("web");
    const u = new URL(r.url);
    expect(u.origin).toBe(origin);
    expect(u.pathname).toBe("/");
    expect(u.searchParams.get("utm_source")).toBe("instagram");
    expect(u.searchParams.get("utm_campaign")).toBe("reel-rotina");
  });
});
