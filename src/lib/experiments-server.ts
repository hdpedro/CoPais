/**
 * Experiments — server-side companion to experiments.ts.
 *
 * SERVER ONLY. Uses `posthog-node`, which transitively imports `node:fs`
 * — Turbopack rejects this from any Client Component bundle, so we keep
 * it in a separate file.
 *
 * Use from Server Components / route handlers / actions only.
 */

import { REGISTRY, isValidVariant, type ExperimentKey } from "./experiments";

/**
 * Server-side variant lookup. Requires the caller to pass the userId
 * (usually from `getUser()`) since PostHog server flags are
 * deterministically hashed on that ID.
 *
 * Falls back to control if PostHog server isn't configured.
 */
export async function getServerExperimentVariant(
  key: ExperimentKey,
  userId: string | null | undefined
): Promise<string> {
  const def = REGISTRY[key];
  const fallback = def.variants[0];
  if (!userId) return fallback;

  const phKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const phHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  if (!phKey) return fallback;

  try {
    const { PostHog } = await import("posthog-node");
    const client = new PostHog(phKey, { host: phHost, flushAt: 1, flushInterval: 0 });
    const variant = await client.getFeatureFlag(key, userId);
    await client.shutdown();
    if (isValidVariant(def, variant)) return variant;
  } catch {
    // swallow
  }
  return fallback;
}
