/* ------------------------------------------------------------------ */
/* /api/discord/feedback — receives GitHub/Vercel webhooks              */
/* Posts CI/deploy results back to Discord                              */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendChannelMessage } from "@/lib/discord/discord-client";
import { buildStatusMessage } from "@/lib/discord/message-builder";

/* ------------------------------------------------------------------ */
/* Verify GitHub webhook signature                                     */
/* ------------------------------------------------------------------ */

async function verifyGitHubSignature(
  body: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signature === `sha256=${hex}`;
}

/* ------------------------------------------------------------------ */
/* POST Handler                                                        */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const body = await req.text();
  const event = req.headers.get("x-github-event");
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  // Verify signature for GitHub webhooks
  if (event) {
    const isValid = await verifyGitHubSignature(body, signature);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }
  }

  const payload = JSON.parse(body);

  // Handle GitHub workflow_run events
  if (event === "workflow_run" && payload.action === "completed") {
    const run = payload.workflow_run;
    const isAutoFix = run.head_branch?.startsWith("auto-fix/");

    if (!isAutoFix) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const success = run.conclusion === "success";
    const channelId = process.env.DISCORD_CHANNEL_DEPLOYS ?? process.env.DISCORD_CHANNEL_ERRORS;

    if (channelId) {
      const message = success
        ? buildStatusMessage(
            "\u2705 CI Passed",
            `**Branch:** \`${run.head_branch}\`\n**Tests:** Passed\n**URL:** ${run.html_url}`,
            0x22c55e // green
          )
        : buildStatusMessage(
            "\u274C CI Failed",
            `**Branch:** \`${run.head_branch}\`\n**Tests:** Failed\n**URL:** ${run.html_url}\n\nReview the PR manually.`,
            0xdc2626 // red
          );

      await sendChannelMessage(channelId, message);
    }

    // If CI failed, revert error status to "new"
    if (!success) {
      const errorIdMatch = run.head_branch?.match(
        /auto-fix\/error-([a-f0-9-]+)-/
      );
      if (errorIdMatch) {
        const supabase = createAdminClient();
        await supabase
          .from("app_errors")
          .update({ status: "new" })
          .like("id", `${errorIdMatch[1]}%`);
      }
    }

    return NextResponse.json({ ok: true });
  }

  // Handle Vercel deploy webhooks
  if (payload.type === "deployment" || payload.deployment) {
    const deployment = payload.deployment ?? payload;
    const channelId = process.env.DISCORD_CHANNEL_DEPLOYS ?? process.env.DISCORD_CHANNEL_ERRORS;

    if (channelId && deployment.state) {
      const isReady = deployment.state === "READY";
      const message = buildStatusMessage(
        isReady ? "\u{1F680} Deploy Success" : "\u26A0\uFE0F Deploy Update",
        `**State:** ${deployment.state}\n**URL:** ${deployment.url ?? "N/A"}`,
        isReady ? 0x22c55e : 0xf59e0b
      );

      await sendChannelMessage(channelId, message);
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, unhandled: true });
}
