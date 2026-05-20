import { NextRequest, NextResponse } from "next/server";
import { resendConfirmation } from "@/actions/auth";

/**
 * POST /api/auth/resend
 *
 * Wrapper REST pra `resendConfirmation` server action. Usado pelos forms
 * que precisam ficar em rotas estáticas (ex: /auth/confirm/error page,
 * /verify-email client component).
 *
 * Body: `application/x-www-form-urlencoded` com `email=...`.
 *
 * Sucesso: redirect 302 pra /verify-email?email=... (cliente re-entra no
 * fluxo com countdown reset). Falha: redirect pra /verify-email?error=...
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = (form.get("email") as string | null) ?? "";
  const result = await resendConfirmation(form);

  const dest = new URL("/verify-email", req.url);
  if (email) dest.searchParams.set("email", email);
  if (result?.error) dest.searchParams.set("error", result.error);
  else dest.searchParams.set("resent", "1");

  return NextResponse.redirect(dest, { status: 303 });
}
