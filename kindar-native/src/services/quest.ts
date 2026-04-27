/**
 * Onboarding quest helper for native — mirrors `src/actions/onboarding-quest.ts`
 * on the PWA.
 *
 * The native services that hit Supabase directly (createGroup, addChild,
 * schedule generation, invite send) must call `markQuestStep()` to keep
 * gamification persistence aligned with the PWA. AI-backed steps
 * (ocr_prescription, ai_agreement) are marked server-side by the
 * `/api/ai/*` route handlers, so the native client doesn't need to
 * duplicate those calls.
 */

import { supabase } from '../lib/supabase';

export type QuestStep =
  | 'add_child'
  | 'setup_calendar'
  | 'invite_co'
  | 'ocr_prescription'
  | 'ai_agreement';

export const QUEST_STEPS: QuestStep[] = [
  'add_child',
  'setup_calendar',
  'invite_co',
  'ocr_prescription',
  'ai_agreement',
];

/**
 * Idempotently marks a quest step. The UNIQUE(user_id, step) constraint in
 * migration 00057 prevents duplicates; we swallow 23505 errors as success.
 *
 * Returns silently on failure — quest tracking is non-critical and shouldn't
 * block the calling flow.
 */
export async function markQuestStep(
  step: QuestStep,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('onboarding_quests').insert({
      user_id: user.id,
      step,
      metadata: metadata ?? {},
    });
  } catch {
    // 23505 (duplicate) is expected on second-mark; everything else is
    // non-critical. Either way, we don't block the caller.
  }
}

/** Returns the user's current quest progress. */
export async function getQuestProgress(): Promise<{
  completed: Set<QuestStep>;
  totalSteps: number;
  completedCount: number;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { completed: new Set(), totalSteps: QUEST_STEPS.length, completedCount: 0 };
    }
    const { data } = await supabase
      .from('onboarding_quests')
      .select('step')
      .eq('user_id', user.id);
    const completed = new Set((data ?? []).map((r) => r.step as QuestStep));
    return {
      completed,
      totalSteps: QUEST_STEPS.length,
      completedCount: completed.size,
    };
  } catch {
    return { completed: new Set(), totalSteps: QUEST_STEPS.length, completedCount: 0 };
  }
}
