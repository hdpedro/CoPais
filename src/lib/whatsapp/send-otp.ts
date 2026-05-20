import "server-only";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp/client";
import { reportServerError } from "@/lib/error-tracking/report-server";

/**
 * Envio do OTP via WhatsApp Cloud API.
 *
 * **Estratégia (2026-05-20 — fix bug Carolina + 5 outras testers travadas):**
 *
 * 1. **TEMPLATE primeiro** (`verificacao_kindar` pt_BR) — funciona fora da
 *    janela 24h porque é AUTHENTICATION category aprovada pelo Meta. Esse
 *    é o ÚNICO caminho confiável pra novos users (que nunca conversaram
 *    com o bot — 100% dos signups iniciais).
 *
 * 2. **TEXT como fallback** — funciona só se há janela 24h aberta (user
 *    mandou msg pro bot nas últimas 24h). Quase nunca pra OTP de primeiro
 *    contato, mas útil pra re-envios quando user já interagiu.
 *
 * **Antes desse fix** (commit que esse arquivo substitui):
 *   - Tentava `sendTextMessage` primeiro → Meta dropava silenciosamente
 *     (200 OK mas mensagem nunca chegava)
 *   - Fallback era `sendTemplateMessage("hello_world", "en_US")` — template
 *     genérico Meta SEM o OTP, totalmente inútil
 *   - Taxa de sucesso histórica: 54.5% (6 de 11 phone_links travados)
 *
 * **Pré-requisito de produção:** template `verificacao_kindar` aprovado no
 * Meta Business Manager → Message Templates. Categoria `AUTHENTICATION`,
 * idioma `pt_BR`, body: "Seu código Kindar é: *{{1}}*. Expira em 10 minutos."
 * Variable `{{1}}` = OTP de 6 dígitos. Doc completa em
 * `docs/03-architecture/WHATSAPP-TEMPLATES.md`.
 *
 * Até template estar aprovado pelo Meta (1-24h após submissão), o fallback
 * text cai 100% — TODOS novos signups vão receber error com instrução pra
 * contatar suporte. **Por isso URGENTE criar o template antes de receber
 * mais signups pagantes.**
 *
 * @returns { ok: true } se mensagem foi aceita pelo Meta (não significa
 *   entrega — Meta confirma entrega via webhook delivery status, mas mesmo
 *   sem confirmação a taxa é >99% pra template autenticação).
 * @returns { ok: false, reason } se template E text falharam — usar pro
 *   `error` retornado pro user.
 */
export async function sendWhatsAppOtp(
  phoneE164: string,
  otp: string,
  filePath: string = "src/lib/whatsapp/send-otp.ts",
): Promise<{ ok: true; channel: "template" | "text" } | { ok: false; reason: string }> {
  const phoneWithout = phoneE164.replace("+", "");
  let templateError: unknown = null;

  // 1. Template AUTHENTICATION — funciona fora da janela 24h.
  try {
    await sendTemplateMessage(phoneWithout, "verificacao_kindar", "pt_BR", [otp]);
    return { ok: true, channel: "template" };
  } catch (err) {
    templateError = err;
    // Não loga ainda — pode ser que o fallback funcione e o user receba o código.
  }

  // 2. Fallback text — funciona dentro de janela 24h. Útil pra re-envios.
  try {
    await sendTextMessage(
      phoneWithout,
      `Kindar - Código de verificação: *${otp}*\n\nDigite este código no app para vincular seu WhatsApp.\n\nExpira em 10 minutos.`,
    );
    return { ok: true, channel: "text" };
  } catch (textError) {
    // Ambos falharam — log critical pra Sentry/Discord. Provavelmente é:
    //   - Template não aprovado/não existe (template error: 132001/132012)
    //   - WHATSAPP_ACCESS_TOKEN inválido
    //   - Account banned/suspenso
    reportServerError(templateError, {
      filePath,
      severity: "critical",
      metadata: {
        phone_e164: phoneE164,
        template_error: String(templateError).slice(0, 300),
        text_fallback_error: String(textError).slice(0, 300),
        stage: "both_channels_failed",
      },
    });
    return {
      ok: false,
      reason: "Não conseguimos enviar o código. Contate suporte@kindar.com.br informando seu telefone.",
    };
  }
}
