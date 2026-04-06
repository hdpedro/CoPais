import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/emails/welcome";
import { captureServerEvent } from "@/lib/posthog-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const error = searchParams.get("error");
  const error_description = searchParams.get("error_description");

  // If Supabase returned an error, redirect to login with message
  if (error) {
    const message = error_description || error;
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`
    );
  }

  // OAuth logins always persist session (equivalent to "Lembrar-me" checked)
  const cookieStore = await cookies();
  cookieStore.set("remember_me", "true", {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });

  // Set long-lived flag for Safari ITP session recovery
  cookieStore.set("kindar-has-session", "1", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  const supabase = await createClient();

  // Handle PKCE code exchange (used for email confirmation, OAuth, password reset)
  if (code) {
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // For recovery flow, always go to reset-password page
      if (type === "recovery" || next === "/reset-password") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }

      // Check if this is a new user (first OAuth login) and send welcome email
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const createdAt = new Date(user.created_at);
          const isNewUser = (Date.now() - createdAt.getTime()) < 60000; // Created less than 60s ago
          if (isNewUser) {
            const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "";
            captureServerEvent(user.id, "user_signup", { provider: "oauth" });
            void sendWelcomeEmail(user.email!, fullName);
          }
        }
      } catch {
        // Never block auth callback for email failure
      }

      return NextResponse.redirect(`${origin}${next}`);
    }

    // If code exchange fails, show specific error
    console.error("Auth callback code exchange error:", exchangeError.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Link expirado ou já utilizado. Tente novamente.")}`
    );
  }

  // Handle token_hash verification (used by some Supabase email templates)
  if (token_hash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "signup" | "email",
      token_hash,
    });

    if (!verifyError) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("Auth callback token verify error:", verifyError.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Link expirado ou já utilizado. Tente novamente.")}`
    );
  }

  // No auth params found — redirect to login
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
