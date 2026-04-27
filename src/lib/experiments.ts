/**
 * A/B testing framework built on top of PostHog feature flags.
 *
 * PostHog handles the heavy lifting:
 *   - Stable bucketing per user (same user always gets the same variant)
 *   - Sticky assignment (even after re-deploy, cohort doesn't change)
 *   - Analytics integration (event fires include the variant automatically)
 *
 * We add a typed layer so:
 *   1. Every experiment has a defined set of variants (no magic strings)
 *   2. useExperiment() hook auto-fires the "experiment_exposed" event
 *      when the variant is first read (clean analytics)
 *   3. Default variant always exists — if PostHog is down or not loaded,
 *      users see the control and we fail-open
 *
 * To create a new experiment:
 *   1. Add an entry to EXPERIMENTS below
 *   2. Create matching PostHog feature flag with the same key
 *   3. Configure variant distribution in PostHog dashboard
 *   4. Use useExperiment("key") in a "use client" component OR
 *      getServerExperiment(key, userId) from server components/actions
 */

import { getPostHogClient } from "./posthog";
import { trackEvent, EVENTS } from "./analytics";

// ============================================================
// EXPERIMENT CATALOG
// ============================================================
export const EXPERIMENTS = {
  /**
   * Landing page H1 headline.
   *
   *   control: "A rotina da criança, organizada em um só lugar" (current)
   *   family:  "Uma assinatura. Família toda acessa."
   *   early:   "Últimas vagas a R$19,90/mês para sempre"
   */
  LANDING_HEADLINE: "landing_headline",

  /**
   * Pricing page default billing cycle selection.
   *
   *   control: monthly (current behavior)
   *   annual:  annual pre-selected (nudges toward longer commitment)
   */
  PRICING_DEFAULT_CYCLE: "pricing_default_cycle",

  /**
   * Trial CTA on post-signup. Drives the "show the ceiling" framing.
   *
   *   control:  "Comece seu teste grátis de 7 dias"
   *   wow:      "Desbloqueie Premium Jurídico por 7 dias, grátis"
   */
  TRIAL_CTA: "trial_cta",
} as const;

export type ExperimentKey = (typeof EXPERIMENTS)[keyof typeof EXPERIMENTS];

export interface ExperimentDef {
  key: ExperimentKey;
  variants: readonly string[]; // first entry = control / fallback
}

/**
 * Registry of experiments and their variants. Adding a new experiment
 * requires updating this table AND creating the corresponding flag on
 * PostHog — the names must match exactly.
 */
export const REGISTRY: Record<ExperimentKey, ExperimentDef> = {
  [EXPERIMENTS.LANDING_HEADLINE]: {
    key: EXPERIMENTS.LANDING_HEADLINE,
    variants: ["control", "family", "early"] as const,
  },
  [EXPERIMENTS.PRICING_DEFAULT_CYCLE]: {
    key: EXPERIMENTS.PRICING_DEFAULT_CYCLE,
    variants: ["control", "annual"] as const,
  },
  [EXPERIMENTS.TRIAL_CTA]: {
    key: EXPERIMENTS.TRIAL_CTA,
    variants: ["control", "wow"] as const,
  },
};

export function isValidVariant(def: ExperimentDef, value: unknown): value is string {
  return typeof value === "string" && def.variants.includes(value);
}

// ============================================================
// CLIENT-SIDE — React hook + raw getter
// ============================================================

/**
 * Returns the active variant of an experiment, bucketed by the current
 * user's PostHog identity. Always returns something — falls back to the
 * first variant (control) if PostHog isn't loaded or the flag is off.
 *
 * IMPORTANT: Call this at the top of a component (not inside effects)
 * so the variant is stable across re-renders.
 */
export function getExperimentVariant(key: ExperimentKey): string {
  const def = REGISTRY[key];
  const fallback = def.variants[0];

  const posthog = getPostHogClient();
  if (!posthog) return fallback;

  try {
    const variant = posthog.getFeatureFlag(key);
    if (isValidVariant(def, variant)) {
      // Track exposure exactly once per session per experiment. PostHog's
      // own `$feature_flag_called` tracks it too, but this custom event
      // lets us join to our own funnel queries without the PH table.
      trackEvent(EVENTS.EXPERIMENT_EXPOSED, { experiment: key, variant });
      return variant;
    }
  } catch {
    // swallow
  }

  return fallback;
}

// SERVER-SIDE: import from "@/lib/experiments-server" — has
// getServerExperimentVariant. Keeping client+server in the same file
// makes Turbopack pull `posthog-node` (uses `node:fs`) into Client
// Component bundles, breaking the build.
