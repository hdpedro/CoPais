/* ------------------------------------------------------------------ */
/* WhatsApp Webhook — receives messages from Meta Cloud API            */
/* GET:  Webhook verification challenge                                */
/* POST: Incoming messages + status updates                            */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, normalizePhone } from "@/lib/whatsapp/signature";
import { processWhatsAppMessage } from "@/lib/whatsapp/processor";
import { WAWebhookPayload, WAExtractedMessage, WAInboundMessage } from "@/lib/whatsapp/types";

export const maxDuration = 30;

/* ------------------------------------------------------------------ */
/* GET — Webhook Verification                                          */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[WA-WEBHOOK] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.error("[WA-WEBHOOK] Verification failed:", { mode, tokenMatch: token === verifyToken });
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/* ------------------------------------------------------------------ */
/* POST — Incoming Messages                                            */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  // Always return 200 quickly to Meta (they retry on non-200)
  try {
    // Verify signature
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error("[WA-WEBHOOK] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload: WAWebhookPayload = JSON.parse(rawBody);

    // Process each entry
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        const value = change.value;

        // Process messages
        if (value.messages && value.messages.length > 0) {
          const contactName = value.contacts?.[0]?.profile?.name;

          for (const msg of value.messages) {
            const extracted = extractMessage(msg, contactName);
            if (extracted) {
              // Process asynchronously but within the function duration
              processWhatsAppMessage(extracted).catch((err) => {
                console.error("[WA-WEBHOOK] Processing error:", err);
              });
            }
          }
        }

        // Status updates (delivery/read receipts) — log only
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            console.log(`[WA-WEBHOOK] Status: ${status.id} → ${status.status}`);
          }
        }
      }
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[WA-WEBHOOK] Error:", error);
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}

/* ------------------------------------------------------------------ */
/* Extract normalized message from Meta webhook payload                */
/* ------------------------------------------------------------------ */

function extractMessage(
  msg: WAInboundMessage,
  contactName?: string
): WAExtractedMessage | null {
  const base: WAExtractedMessage = {
    from: normalizePhone(msg.from),
    messageId: msg.id,
    timestamp: Number(msg.timestamp) * 1000,
    type: msg.type,
    contactName,
  };

  switch (msg.type) {
    case "text":
      return { ...base, text: msg.text?.body };

    case "image":
      return {
        ...base,
        mediaId: msg.image?.id,
        mediaMimeType: msg.image?.mime_type,
        caption: msg.image?.caption,
      };

    case "audio":
      return {
        ...base,
        mediaId: msg.audio?.id,
        mediaMimeType: msg.audio?.mime_type,
      };

    case "video":
      return {
        ...base,
        mediaId: msg.video?.id,
        mediaMimeType: msg.video?.mime_type,
      };

    case "document":
      return {
        ...base,
        mediaId: msg.document?.id,
        mediaMimeType: msg.document?.mime_type,
      };

    case "interactive":
      if (msg.interactive?.type === "button_reply") {
        return {
          ...base,
          type: "interactive",
          buttonReplyId: msg.interactive.button_reply?.id,
          text: msg.interactive.button_reply?.title,
        };
      }
      if (msg.interactive?.type === "list_reply") {
        return {
          ...base,
          type: "interactive",
          listReplyId: msg.interactive.list_reply?.id,
          text: msg.interactive.list_reply?.title,
        };
      }
      return base;

    case "button":
      return {
        ...base,
        text: msg.button?.text,
        buttonReplyId: msg.button?.payload,
      };

    case "sticker":
    case "contacts":
    case "location":
      return base;

    default:
      return null;
  }
}
