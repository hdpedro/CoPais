/**
 * POST /api/auth/delete-account
 *
 * Apple Guideline 5.1.1(v) exige que apps com criacao de conta permitam
 * delecao in-app. Este endpoint:
 *
 *   1. Valida a sessao (Bearer token do @supabase/ssr ou Authorization
 *      header — native manda Bearer)
 *   2. Confirma que o body tem { confirmation: "DELETAR" } (defesa extra
 *      em profundidade — UI ja exige, mas nunca confia so no cliente)
 *   3. Deleta via admin client de auth.users — todas as FKs `ON DELETE
 *      CASCADE` em profiles -> tabelas-filhas (ver migration 00001) fazem
 *      o resto. Nenhum orfao fica.
 *   4. Se o usuario tem Stripe customer, cancela a subscription antes
 *      pra evitar cobranca zumbi. Apple IAP nao pode ser cancelada
 *      server-side — usuario tem que cancelar em Ajustes > Assinaturas
 *      (mensagem exibida na UI).
 *
 * NAO e reversivel.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { stripe } from "@/lib/stripe";
import { revokeAppleToken } from "@/lib/apple-siwa-revoke";

export async function POST(req: NextRequest) {
  try {
    // Auth: aceita tanto cookie (web) quanto Bearer (native)
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const admin = createAdminClient();
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) {
        return NextResponse.json({ error: "Sessao invalida" }, { status: 401 });
      }
      userId = data.user.id;
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
      }
      userId = user.id;
    }

    // Body: exige confirmacao tipada
    const body = await req.json().catch(() => ({}));
    if (body?.confirmation !== "DELETAR") {
      return NextResponse.json(
        { error: "Confirmacao ausente ou incorreta. Digite DELETAR." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Cancela subscriptions Stripe antes de apagar o user (evita cobranca
    // zumbi). Apple IAP nao da pra cancelar server-side — usuario tem que
    // fazer em Ajustes > Apple ID > Assinaturas. A UI avisa disso.
    const { data: subs } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id, payment_provider, status")
      .eq("user_id", userId)
      .eq("payment_provider", "stripe")
      .in("status", ["active", "trialing", "past_due"]);

    for (const s of subs || []) {
      if (!s.stripe_subscription_id) continue;
      try {
        await stripe.subscriptions.cancel(s.stripe_subscription_id);
      } catch (err) {
        // Nao bloqueia a delecao — loga e segue
        console.warn(`[delete-account] Failed to cancel Stripe sub ${s.stripe_subscription_id}:`, err);
      }
    }

    // Apple Guideline 5.1.1(v): revogar refresh_token Apple Sign-In
    // se o usuario logou com Apple e a gente tem o token. Best-effort —
    // se nao tiver token (ex: usuario logou via email ou Google), pulamos.
    try {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      const meta = (u?.user?.user_metadata as Record<string, unknown>) || {};
      const appleRefresh = typeof meta.apple_refresh_token === "string"
        ? meta.apple_refresh_token
        : null;
      if (appleRefresh) {
        const revoke = await revokeAppleToken(appleRefresh, "refresh_token");
        if (!revoke.ok) {
          console.warn(`[delete-account] Apple revoke failed for ${userId}:`, revoke.reason);
        } else {
          console.log(`[delete-account] Apple token revoked for ${userId}`);
        }
      }
    } catch (err) {
      console.warn(`[delete-account] Apple revoke error (non-fatal):`, err);
    }

    // Delete auth.users — cascateia via ON DELETE CASCADE por todas as
    // tabelas que referenciam profiles.id. O profiles row em si cascata
    // automaticamente porque profiles.id FK -> auth.users(id) ON DELETE
    // CASCADE (migration 00001 linha 14).
    const { error: delError } = await admin.auth.admin.deleteUser(userId);

    if (delError) {
      reportServerError(delError, {
        filePath: "src/app/api/auth/delete-account/route.ts",
        severity: "critical",
      });
      return NextResponse.json(
        { error: "Erro ao deletar conta. Tente novamente ou contate suporte." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    reportServerError(error, {
      filePath: "src/app/api/auth/delete-account/route.ts",
      severity: "critical",
    });
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}
