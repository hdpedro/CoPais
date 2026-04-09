/* ------------------------------------------------------------------ */
/* Discord channel mapping — folder category → channel ID              */
/* ------------------------------------------------------------------ */

import { FolderCategory } from "@/lib/error-tracking/classify";

/**
 * Maps each folder category to a Discord channel ID.
 *
 * MVP: use a single DISCORD_CHANNEL_ERRORS for all categories.
 * Scale: set individual DISCORD_CHANNEL_<CATEGORY> env vars for per-folder channels.
 */
export function getChannelId(category: FolderCategory): string | null {
  const fallback = process.env.DISCORD_CHANNEL_ERRORS ?? null;

  const channelMap: Partial<Record<FolderCategory, string | undefined>> = {
    app: process.env.DISCORD_CHANNEL_APP,
    components: process.env.DISCORD_CHANNEL_COMPONENTS,
    lib: process.env.DISCORD_CHANNEL_LIB,
    hooks: process.env.DISCORD_CHANNEL_HOOKS,
    actions: process.env.DISCORD_CHANNEL_ACTIONS,
    services: process.env.DISCORD_CHANNEL_SERVICES,
    supabase: process.env.DISCORD_CHANNEL_SUPABASE,
  };

  return channelMap[category] ?? fallback;
}
