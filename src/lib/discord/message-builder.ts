/* ------------------------------------------------------------------ */
/* Discord message builder — formats error notifications               */
/* ------------------------------------------------------------------ */

import { severityColor } from "@/lib/error-tracking/classify";

export interface ErrorNotification {
  id: string;
  message: string;
  stack?: string;
  filePath?: string;
  folderCategory: string;
  severity: string;
  /** Sentry event id pra cross-link no embed (botão "Ver no Sentry"). */
  sentryEventId?: string;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  timestamp: string;
  footer: { text: string };
}

interface DiscordButton {
  type: 2;
  style: number;
  label: string;
  custom_id: string;
  emoji?: { name: string };
}

interface DiscordLinkButton {
  type: 2;
  style: 5; // Link
  label: string;
  url: string;
  emoji?: { name: string };
}

export interface DiscordMessagePayload {
  embeds: DiscordEmbed[];
  components: { type: 1; components: (DiscordButton | DiscordLinkButton)[] }[];
}

/** Truncate stack trace for embed field (max 1024 chars) */
function truncateStack(stack: string | undefined, maxLines = 10): string {
  if (!stack) return "No stack trace";
  const lines = stack.split("\n").slice(0, maxLines);
  const text = lines.join("\n");
  return text.length > 1000 ? text.slice(0, 997) + "..." : text;
}

/** Get severity emoji */
function severityEmoji(severity: string): string {
  switch (severity) {
    case "critical":
      return "\u{1F6A8}"; // 🚨
    case "error":
      return "\u274C"; // ❌
    case "warning":
      return "\u26A0\uFE0F"; // ⚠️
    default:
      return "\u2139\uFE0F"; // ℹ️
  }
}

/** Category badge */
function categoryBadge(category: string): string {
  const badges: Record<string, string> = {
    app: "\u{1F4F1} app",
    components: "\u{1F9E9} components",
    lib: "\u{1F4DA} lib",
    hooks: "\u{1FA9D} hooks",
    actions: "\u26A1 actions",
    services: "\u{1F310} services",
    supabase: "\u{1F5C4}\uFE0F supabase",
    unknown: "\u2753 unknown",
  };
  return badges[category] ?? category;
}

/**
 * Build a Discord message payload for an error notification.
 * Includes embed with error details and action buttons.
 */
export function buildErrorMessage(error: ErrorNotification): DiscordMessagePayload {
  const embed: DiscordEmbed = {
    title: `${severityEmoji(error.severity)} Novo erro (${error.severity})`,
    description: `\`\`\`\n${error.message}\n\`\`\``,
    color: severityColor(error.severity),
    fields: [
      {
        name: "Categoria",
        value: categoryBadge(error.folderCategory),
        inline: true,
      },
      {
        name: "Arquivo",
        value: error.filePath ? `\`${error.filePath}\`` : "Desconhecido",
        inline: true,
      },
      {
        name: "Stack Trace",
        value: `\`\`\`\n${truncateStack(error.stack)}\n\`\`\``,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: `Error ID: ${error.id}` },
  };

  const buttons: (DiscordButton | DiscordLinkButton)[] = [
    {
      type: 2,
      style: 1, // Primary (blurple)
      label: "Fix with Claude",
      custom_id: `fix_error:${error.id}`,
      emoji: { name: "\u{1F916}" }, // 🤖
    },
    {
      type: 2,
      style: 2, // Secondary (gray)
      label: "Acknowledge",
      custom_id: `ack_error:${error.id}`,
      emoji: { name: "\u{1F440}" }, // 👀
    },
    {
      type: 2,
      style: 4, // Danger (red)
      label: "Ignore",
      custom_id: `ignore_error:${error.id}`,
      emoji: { name: "\u274C" }, // ❌
    },
  ];

  // Sentry cross-link (2026-05-17). report-server.ts captura via
  // Sentry.captureException primeiro e popula sentry_event_id no app_errors.
  // Botão style=5 (Link) abre o issue na sentry.io — stack simbolizado +
  // breadcrumbs + session replay em 1 clique a partir do Discord.
  if (error.sentryEventId) {
    const sentryOrg = process.env.SENTRY_ORG ?? "kindar";
    const sentryProject = process.env.SENTRY_PROJECT ?? "kindar-pwa";
    buttons.push({
      type: 2,
      style: 5, // Link
      label: "Ver no Sentry",
      url: `https://sentry.io/organizations/${sentryOrg}/projects/${sentryProject}/events/${error.sentryEventId}/`,
      emoji: { name: "\u{1F50D}" }, // 🔍
    });
  }

  return {
    embeds: [embed],
    components: [{ type: 1, components: buttons }],
  };
}

/**
 * Build a simple status update message (for fix results, CI feedback, etc.)
 */
export function buildStatusMessage(
  title: string,
  description: string,
  color: number
): { embeds: DiscordEmbed[] } {
  return {
    embeds: [
      {
        title,
        description,
        color,
        fields: [],
        timestamp: new Date().toISOString(),
        footer: { text: "Kindar Error Tracker" },
      },
    ],
  };
}
