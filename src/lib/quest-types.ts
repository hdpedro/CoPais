/**
 * Onboarding Quest types + constants. Lives in lib/ (not actions/) so
 * Client Components can import without triggering "use server" file
 * restrictions (only async functions can export from a server action file).
 */

export type QuestStep =
  | "add_child"
  | "setup_calendar"
  | "invite_co"
  | "ocr_prescription"
  | "ai_agreement";

export const QUEST_STEPS: QuestStep[] = [
  "add_child",
  "setup_calendar",
  "invite_co",
  "ocr_prescription",
  "ai_agreement",
];

export interface QuestProgress {
  completed: Set<QuestStep>;
  totalSteps: number;
  completedCount: number;
}
