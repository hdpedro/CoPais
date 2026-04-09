/* ------------------------------------------------------------------ */
/* Fix Pipeline Orchestrator                                           */
/* Coordinates: error → Claude fix → GitHub PR → Discord feedback      */
/* ------------------------------------------------------------------ */

import { createAdminClient } from "@/lib/supabase/admin";
import { editInteractionFollowup } from "@/lib/discord/discord-client";
import { generateFix } from "./claude-fixer";
import { createFixPR } from "./github-pr";
import { ErrorDetails } from "./types";
import { FolderCategory } from "@/lib/error-tracking/classify";

/**
 * Run the full fix pipeline for an error.
 * Called from Discord interaction handler (fire-and-forget).
 */
export async function runFixPipeline(
  errorId: string,
  applicationId: string,
  interactionToken: string
): Promise<void> {
  const supabase = createAdminClient();

  try {
    // 1. Fetch error details from Supabase
    const { data: errorRow, error: fetchError } = await supabase
      .from("app_errors")
      .select("*")
      .eq("id", errorId)
      .single();

    if (fetchError || !errorRow) {
      throw new Error(`Error not found: ${errorId}`);
    }

    const errorDetails: ErrorDetails = {
      id: errorRow.id,
      message: errorRow.message,
      stackTrace: errorRow.stack_trace,
      filePath: errorRow.file_path,
      folderCategory: errorRow.folder_category as FolderCategory,
    };

    if (!errorDetails.filePath) {
      throw new Error("Cannot auto-fix: no file path available");
    }

    // 2. Generate fix with Claude
    await editInteractionFollowup(applicationId, interactionToken, {
      content: `\u{1F916} Generating fix with Claude for \`${errorDetails.filePath}\`...`,
    });

    const fix = await generateFix(errorDetails);

    // 3. Create GitHub PR
    await editInteractionFollowup(applicationId, interactionToken, {
      content: `\u{1F4E6} Creating PR for fix in \`${errorDetails.filePath}\`...`,
    });

    const pr = await createFixPR(
      errorId,
      fix,
      errorDetails.folderCategory
    );

    // 4. Update error record
    await supabase
      .from("app_errors")
      .update({
        status: "fixed",
        fix_pr_url: pr.url,
      })
      .eq("id", errorId);

    // 5. Send success followup
    await editInteractionFollowup(applicationId, interactionToken, {
      content: [
        `\u2705 **Fix created successfully!**`,
        ``,
        `**PR:** ${pr.url}`,
        `**Branch:** \`${pr.branch}\``,
        `**File:** \`${fix.filePath}\``,
        ``,
        `> ${fix.explanation}`,
      ].join("\n"),
    });
  } catch (err) {
    // Revert status on failure
    await supabase
      .from("app_errors")
      .update({ status: "new" })
      .eq("id", errorId);

    // Notify Discord about failure
    const message =
      err instanceof Error ? err.message : "Unknown error";

    await editInteractionFollowup(applicationId, interactionToken, {
      content: `\u274C **Fix failed** for error \`${errorId}\`\n\n> ${message}`,
    });

    throw err;
  }
}
