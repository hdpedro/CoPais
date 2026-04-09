/* ------------------------------------------------------------------ */
/* Claude Fixer — uses Anthropic API to generate code fixes            */
/* ------------------------------------------------------------------ */

import { ErrorDetails, FixResult } from "./types";

const GITHUB_API = "https://api.github.com";

/* ------------------------------------------------------------------ */
/* Read file from GitHub (serverless-friendly, no filesystem access)   */
/* ------------------------------------------------------------------ */

async function readFileFromGitHub(filePath: string): Promise<string | null> {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) return null;

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}?ref=main`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3.raw",
      },
    }
  );

  if (!res.ok) return null;
  return res.text();
}

/* ------------------------------------------------------------------ */
/* Call Claude API to generate a fix                                    */
/* ------------------------------------------------------------------ */

export async function generateFix(error: ErrorDetails): Promise<FixResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  if (!error.filePath) throw new Error("Cannot fix error without file path");

  // Read the source file from GitHub
  const fileContent = await readFileFromGitHub(error.filePath);
  if (!fileContent) {
    throw new Error(`Could not read file: ${error.filePath}`);
  }

  const systemPrompt = `You are a senior TypeScript/Next.js developer working on the Kindar (CoPais) application.
Your job is to fix the bug described below. The app uses:
- Next.js 16 App Router with React 19
- Supabase for backend
- TypeScript strict mode
- Tailwind CSS v4

Rules:
1. Return ONLY the complete fixed file content — no markdown, no explanations, no code fences.
2. Preserve all existing imports and exports.
3. Make the minimal change necessary to fix the bug.
4. Do not add unnecessary comments or refactoring.
5. The fix must be production-ready.`;

  const userPrompt = `## Error
**Message:** ${error.message}
**File:** ${error.filePath}
**Category:** ${error.folderCategory}

## Stack Trace
${error.stackTrace ?? "No stack trace available"}

## Current File Content
\`\`\`typescript
${fileContent}
\`\`\`

Fix this error. Return the complete corrected file.`;

  // Call Claude API directly via fetch (avoids adding SDK dependency for single use)
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const fixedContent =
    data.content?.[0]?.type === "text" ? data.content[0].text : "";

  if (!fixedContent) {
    throw new Error("Claude returned empty response");
  }

  // Extract explanation from stop_reason or generate a summary
  const explanation = `Auto-fix for ${error.folderCategory} error in ${error.filePath}: ${error.message}`;

  return {
    fixedContent: fixedContent.trim(),
    explanation,
    filePath: error.filePath,
  };
}
