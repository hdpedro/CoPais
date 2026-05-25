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
 * Sucesso: redirect 303 pra /verify-email?email=...&resent=1 (cliente
 * re-entra no fluxo com countdown reset). Falha: redirect pra
 * /verify-email?email=...&errorCode=<code>&errorParams=<json> — o cliente
 * resolve via i18n.
 */
export async function POST(req: NextRequest) {
  const form = (await req.formData()) as unknown as FormData;
  const email = (form.get("email") as string | null) ?? "";
  const result = await resendConfirmation(form);

  const dest = new URL("/verify-email", req.url);
  if (email) dest.searchParams.set("email", email);
  if (result && "error" in result) {
    dest.searchParams.set("errorCode", result.errorCode);
    if (result.errorParams) {
      dest.searchParams.set("errorParams", JSON.stringify(result.errorParams));
    }
    // Legacy `error` param kept for clients on old bundles (will be removed
    // once everyone is on the i18n-aware client).
    dest.searchParams.set("error", result.error);
  } else {
    dest.searchParams.set("resent", "1");
  }

  return NextResponse.redirect(dest, { status: 303 });
}
