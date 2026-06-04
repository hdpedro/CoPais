/* ------------------------------------------------------------------ */
/* WhatsApp Cloud API Client                                          */
/* Send messages, interactive buttons, templates, download media       */
/* ------------------------------------------------------------------ */

import {
  WASendText,
  WASendInteractiveButtons,
  WASendInteractiveList,
  WASendTemplate,
  WASendPayload,
  WASendResponse,
} from "./types";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required");
  }

  return { accessToken, phoneNumberId };
}

/* ------------------------------------------------------------------ */
/* Core Send                                                           */
/* ------------------------------------------------------------------ */

async function sendMessage(payload: WASendPayload): Promise<WASendResponse> {
  const { accessToken, phoneNumberId } = getConfig();
  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;

  // Meta API requires phone without '+' prefix
  if (payload.to.startsWith("+")) {
    payload.to = payload.to.slice(1);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    console.error("[WA-CLIENT] Send error:", JSON.stringify(error));
    throw new Error(`WhatsApp API error ${res.status}: ${error?.error?.message || res.statusText}`);
  }

  return res.json();
}

/* ------------------------------------------------------------------ */
/* Send Text Message                                                   */
/* ------------------------------------------------------------------ */

export async function sendTextMessage(to: string, text: string): Promise<string> {
  // WhatsApp max text length is 4096
  const body = text.length > 4096 ? text.slice(0, 4093) + "..." : text;

  const payload: WASendText = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body },
  };

  const result = await sendMessage(payload);
  return result.messages[0]?.id || "";
}

/* ------------------------------------------------------------------ */
/* Send Interactive Button Message (max 3 buttons)                     */
/* ------------------------------------------------------------------ */

export async function sendButtonMessage(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): Promise<string> {
  if (buttons.length > 3) {
    throw new Error("WhatsApp interactive buttons limited to 3");
  }

  const payload: WASendInteractiveButtons = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply" as const,
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };

  const result = await sendMessage(payload);
  return result.messages[0]?.id || "";
}

/* ------------------------------------------------------------------ */
/* Send Interactive List Message (for group selection, etc.)            */
/* ------------------------------------------------------------------ */

export async function sendListMessage(
  to: string,
  body: string,
  buttonText: string,
  rows: Array<{ id: string; title: string; description?: string }>
): Promise<string> {
  const payload: WASendInteractiveList = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body.slice(0, 1024) },
      action: {
        button: buttonText.slice(0, 20),
        sections: [
          {
            title: "Opcoes",
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: r.description?.slice(0, 72),
            })),
          },
        ],
      },
    },
  };

  const result = await sendMessage(payload);
  return result.messages[0]?.id || "";
}

/* ------------------------------------------------------------------ */
/* Send Template Message                                               */
/* ------------------------------------------------------------------ */

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams?: string[]
): Promise<string> {
  const payload: WASendTemplate = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyParams && bodyParams.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParams.map((p) => ({
                  type: "text" as const,
                  text: p,
                })),
              },
            ],
          }
        : {}),
    },
  };

  const result = await sendMessage(payload);
  return result.messages[0]?.id || "";
}

/* ------------------------------------------------------------------ */
/* Send Authentication Template (OTP)                                  */
/* ------------------------------------------------------------------ */

/**
 * Envia um template de AUTENTICACAO (codigo de uso unico). A Meta exige o
 * codigo tanto no corpo (`body`) quanto no botao copiar-codigo (`button`).
 * Usado pro OTP de vinculo de WhatsApp, que precisa de template aprovado pra
 * ser entregue FORA da janela de 24h — texto livre so entrega dentro da janela
 * (bug Alexandre/Amanda 2026-06-03: usuario que nunca falou com o bot nunca
 * recebia o codigo). Gateado por env `WHATSAPP_OTP_TEMPLATE`.
 */
export async function sendAuthTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  code: string,
): Promise<string> {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [{ type: "text", text: code }],
        },
      ],
    },
  } as unknown as WASendPayload;

  const result = await sendMessage(payload);
  return result.messages[0]?.id || "";
}

/* ------------------------------------------------------------------ */
/* Download Media                                                      */
/* ------------------------------------------------------------------ */

export async function downloadMedia(mediaId: string): Promise<Buffer> {
  const { accessToken } = getConfig();

  // Step 1: Get media URL
  const metaRes = await fetch(`${GRAPH_API_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to get media URL: ${metaRes.status}`);
  }

  const metaData = await metaRes.json();
  const mediaUrl = metaData.url;

  if (!mediaUrl) {
    throw new Error("No media URL returned");
  }

  // Step 2: Download the file
  const fileRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!fileRes.ok) {
    throw new Error(`Failed to download media: ${fileRes.status}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/* ------------------------------------------------------------------ */
/* Mark as Read                                                        */
/* ------------------------------------------------------------------ */

export async function markAsRead(messageId: string): Promise<void> {
  const { accessToken, phoneNumberId } = getConfig();

  await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).catch((err) => {
    console.error("[WA-CLIENT] markAsRead error:", err);
  });
}

/* ------------------------------------------------------------------ */
/* Confirmation helpers                                                */
/* ------------------------------------------------------------------ */

export async function sendConfirmation(
  to: string,
  confirmationText: string
): Promise<string> {
  return sendButtonMessage(to, confirmationText, [
    { id: "confirm", title: "Confirmar" },
    { id: "cancel", title: "Cancelar" },
  ]);
}

export async function sendSuccess(to: string, message: string): Promise<string> {
  return sendTextMessage(to, `\u2705 ${message}`);
}

export async function sendError(to: string, message: string): Promise<string> {
  return sendTextMessage(to, `\u26A0\uFE0F ${message}`);
}
