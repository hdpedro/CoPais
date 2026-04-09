/* ------------------------------------------------------------------ */
/* Discord client — lightweight fetch-based (no discord.js)            */
/* ------------------------------------------------------------------ */

import { FolderCategory } from "@/lib/error-tracking/classify";
import { getChannelId } from "./channels";
import {
  buildErrorMessage,
  DiscordMessagePayload,
  ErrorNotification,
} from "./message-builder";

const DISCORD_API = "https://discord.com/api/v10";

/* ------------------------------------------------------------------ */
/* Core: send message to a channel via Bot token                       */
/* ------------------------------------------------------------------ */

export async function sendChannelMessage(
  channelId: string,
  payload: DiscordMessagePayload | Record<string, unknown>
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("[discord] DISCORD_BOT_TOKEN not set, skipping message");
    return;
  }

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[discord] Failed to send message (${res.status}):`, text);
  }
}

/* ------------------------------------------------------------------ */
/* Core: send message via webhook URL (simple, no bot token needed)    */
/* ------------------------------------------------------------------ */

export async function sendWebhookMessage(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[discord] Webhook failed (${res.status}):`, text);
  }
}

/* ------------------------------------------------------------------ */
/* Edit an existing message (for follow-ups after button clicks)       */
/* ------------------------------------------------------------------ */

export async function editInteractionFollowup(
  applicationId: string,
  interactionToken: string,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch(
    `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`[discord] Follow-up edit failed (${res.status}):`, text);
  }
}

/* ------------------------------------------------------------------ */
/* High-level: notify Discord about a new error                        */
/* ------------------------------------------------------------------ */

export async function notifyDiscord(error: ErrorNotification): Promise<void> {
  const channelId = getChannelId(error.folderCategory as FolderCategory);

  if (!channelId) {
    console.warn(
      "[discord] No channel configured for category:",
      error.folderCategory
    );
    return;
  }

  const message = buildErrorMessage(error);
  await sendChannelMessage(channelId, message);
}
