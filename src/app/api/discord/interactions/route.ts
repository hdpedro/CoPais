/* ------------------------------------------------------------------ */
/* /api/discord/interactions — handles Discord button clicks            */
/* Configured as Interactions Endpoint URL in Discord Developer Portal  */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { editInteractionFollowup } from "@/lib/discord/discord-client";
import { runFixPipeline } from "@/lib/fix-pipeline/pipeline";

/* ------------------------------------------------------------------ */
/* Ed25519 signature verification                                      */
/* ------------------------------------------------------------------ */

async function verifyDiscordSignature(
  body: string,
  signature: string,
  timestamp: string
): Promise<boolean> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return false;

  try {
    const keyBytes = hexToUint8Array(publicKey);
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes.buffer as ArrayBuffer,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const message = new TextEncoder().encode(timestamp + body);
    const sig = hexToUint8Array(signature);

    return crypto.subtle.verify("Ed25519", key, sig.buffer as ArrayBuffer, message.buffer as ArrayBuffer);
  } catch {
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/* ------------------------------------------------------------------ */
/* POST Handler                                                        */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";

  // Verify signature
  const isValid = await verifyDiscordSignature(body, signature, timestamp);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const interaction = JSON.parse(body);

  // Type 1: PING (Discord verification handshake)
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Type 3: MESSAGE_COMPONENT (button click)
  if (interaction.type === 3) {
    const customId: string = interaction.data?.custom_id ?? "";
    const [action, errorId] = customId.split(":");

    if (!errorId) {
      return NextResponse.json({
        type: 4,
        data: { content: "Invalid interaction", flags: 64 },
      });
    }

    const supabase = createAdminClient();

    switch (action) {
      case "fix_error": {
        // Update status to fixing
        await supabase
          .from("app_errors")
          .update({ status: "fixing" })
          .eq("id", errorId);

        // Return deferred response (we'll follow up later)
        const applicationId = process.env.DISCORD_APPLICATION_ID!;
        const interactionToken = interaction.token;

        // Fire-and-forget: run fix pipeline and update via followup
        runFixPipeline(errorId, applicationId, interactionToken).catch(
          (err) => {
            console.error("[discord] Fix pipeline failed:", err);
            editInteractionFollowup(applicationId, interactionToken, {
              content: `\u274C Fix failed for error \`${errorId}\`: ${err instanceof Error ? err.message : "Unknown error"}`,
            }).catch(() => {});
          }
        );

        return NextResponse.json({
          type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });
      }

      case "ack_error": {
        await supabase
          .from("app_errors")
          .update({ status: "acknowledged" })
          .eq("id", errorId);

        return NextResponse.json({
          type: 4,
          data: {
            content: `\u{1F440} Error \`${errorId}\` acknowledged.`,
            flags: 64, // ephemeral
          },
        });
      }

      case "ignore_error": {
        await supabase
          .from("app_errors")
          .update({ status: "ignored" })
          .eq("id", errorId);

        return NextResponse.json({
          type: 4,
          data: {
            content: `\u{1F6AB} Error \`${errorId}\` ignored.`,
            flags: 64,
          },
        });
      }

      default:
        return NextResponse.json({
          type: 4,
          data: { content: "Unknown action", flags: 64 },
        });
    }
  }

  return NextResponse.json({ error: "Unknown interaction type" }, { status: 400 });
}
