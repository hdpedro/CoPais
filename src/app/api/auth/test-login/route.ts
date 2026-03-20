import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Test-only login route - accepts email/password via query params
// Should be removed or protected in real production
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");
  const password = request.nextUrl.searchParams.get("password");

  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  // Only allow @2lares.test emails for safety
  if (!email.endsWith("@2lares.test")) {
    return NextResponse.json({ error: "only test accounts allowed" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
}
