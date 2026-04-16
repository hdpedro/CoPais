/* ------------------------------------------------------------------ */
/* Server Action error tracking wrapper                                */
/* Wraps any server action to capture errors without changing logic     */
/* ------------------------------------------------------------------ */

import { reportServerError } from "./report-server";

/**
 * Wraps a server action function to automatically report errors.
 * Does NOT change the action's behavior — errors still propagate normally.
 *
 * Usage:
 *   export const createEvent = withErrorTracking(
 *     "src/actions/events.ts",
 *     async (formData: FormData) => { ... }
 *   );
 */
export function withErrorTracking<T extends unknown[], R>(
  filePath: string,
  action: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await action(...args);
    } catch (error) {
      reportServerError(error, { filePath });
      throw error; // Re-throw — action behavior unchanged
    }
  };
}
