import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashIp } from "@/lib/referral";
import { cookies, headers } from "next/headers";

/**
 * Referral landing — `kindar.com.br/r/CODE`. Logs the click, drops a
 * cookie so we remember the code through the signup flow, then
 * redirects to /signup with `?ref=CODE`.
 *
 * Tracking is best-effort — if anything fails we still redirect to
 * signup so the user experience never breaks on the promise "click the
 * link, land in the signup form".
 */
export default async function ReferralLanding({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase().slice(0, 12);

  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    redirect("/signup");
  }

  const admin = createAdminClient();

  // Validate the code actually exists. Invalid codes still redirect to
  // signup (without setting the cookie) so we don't leak whether a code
  // is valid to would-be brute-forcers.
  const { data: owner } = await admin
    .from("profiles")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();

  if (owner) {
    const headerStore = await headers();
    const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = headerStore.get("user-agent") ?? null;

    // Log the click (async, non-blocking — we don't await the insert
    // so the redirect is snappy)
    admin.from("referral_clicks").insert({
      code,
      ip_hash: hashIp(ip),
      user_agent: ua?.slice(0, 255) ?? null,
      landing_path: `/r/${code}`,
    }).then(() => {});

    // Set the ref cookie (30d) — read by the signup form to populate
    // the referred_by column on the new profile.
    const cookieStore = await cookies();
    cookieStore.set("kindar_ref", code, {
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "lax",
      path: "/",
    });
  }

  redirect(`/signup?ref=${code}`);
}
