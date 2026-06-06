import { NextResponse, after, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { captureServerEventAndFlush } from "@/lib/posthog-server";
import {
  detectDeviceOs,
  parseOsOverride,
  parseUtmParams,
  resolveDestination,
  STORE_LINK_CLICK_EVENT,
} from "@/lib/store-links";

/**
 * GET /baixar — the single tracked "Baixar o Kindar" smart link for
 * social bios. Detects the visitor's OS and 302-redirects to the right
 * store (carrying native attribution tags), logging the click to PostHog
 * so it joins the existing acquisition → activation funnel.
 *
 * Excluded from the middleware matcher (src/middleware.ts) so it never
 * hits Supabase auth — a logged-out Instagram visitor would otherwise be
 * bounced to /session-recovery — and the redirect stays fast (no getUser
 * round-trip).
 */

// posthog-node uses node:fs; never run this on the Edge runtime.
export const runtime = "nodejs";
// A redirect that depends on UA + query must never be statically cached.
export const dynamic = "force-dynamic";

export function GET(request: NextRequest): NextResponse {
  const { searchParams, origin } = request.nextUrl;

  const utm = parseUtmParams(searchParams);
  const os =
    parseOsOverride(searchParams) ??
    detectDeviceOs(request.headers.get("user-agent"));
  const { url, destination } = resolveDestination(os, utm, origin);

  // Attribute to the returning visitor's PostHog identity when their
  // anonymous cookie is present; otherwise mint a fresh anonymous id.
  const distinctId = readPostHogDistinctId(request) ?? `anon_${randomUUID()}`;

  // Capture AFTER the response is sent so the redirect is instant, but
  // still flush on Vercel (the function stays alive for `after`).
  after(() =>
    captureServerEventAndFlush(distinctId, STORE_LINK_CLICK_EVENT, {
      device_os: os,
      destination,
      utm_source: utm.source,
      utm_medium: utm.medium,
      utm_campaign: utm.campaign,
      utm_content: utm.content,
      utm_term: utm.term,
      referer: request.headers.get("referer") ?? undefined,
      link_path: "/baixar",
    }),
  );

  return NextResponse.redirect(url, 302);
}

/**
 * Best-effort: pull the posthog-js `distinct_id` from its cookie
 * (`ph_<key>_posthog`) so a click can attach to an existing person and
 * complete the funnel for returning visitors.
 */
function readPostHogDistinctId(request: NextRequest): string | null {
  try {
    const cookie = request.cookies
      .getAll()
      .find((c) => c.name.startsWith("ph_") && c.name.endsWith("_posthog"));
    if (!cookie?.value) return null;
    const parsed = JSON.parse(decodeURIComponent(cookie.value)) as {
      distinct_id?: unknown;
    };
    return typeof parsed.distinct_id === "string" ? parsed.distinct_id : null;
  } catch {
    return null;
  }
}
