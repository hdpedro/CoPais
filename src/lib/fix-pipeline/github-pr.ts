/* ------------------------------------------------------------------ */
/* GitHub PR Creator — creates branches and PRs via GitHub API         */
/* ------------------------------------------------------------------ */

import { FixResult, PRResult } from "./types";
import { FolderCategory } from "@/lib/error-tracking/classify";

const GITHUB_API = "https://api.github.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };
}

function repo() {
  return `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`;
}

/* ------------------------------------------------------------------ */
/* Get SHA of main branch HEAD                                         */
/* ------------------------------------------------------------------ */

async function getMainSha(): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${repo()}/git/ref/heads/main`,
    { headers: headers() }
  );

  if (!res.ok) throw new Error(`Failed to get main SHA: ${res.status}`);
  const data = await res.json();
  return data.object.sha;
}

/* ------------------------------------------------------------------ */
/* Create a new branch                                                 */
/* ------------------------------------------------------------------ */

async function createBranch(branchName: string, sha: string): Promise<void> {
  const res = await fetch(`${GITHUB_API}/repos/${repo()}/git/refs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create branch: ${res.status} ${text}`);
  }
}

/* ------------------------------------------------------------------ */
/* Get current file SHA (needed for update)                            */
/* ------------------------------------------------------------------ */

async function getFileSha(
  filePath: string,
  branch: string
): Promise<string | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${repo()}/contents/${filePath}?ref=${branch}`,
    { headers: headers() }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.sha;
}

/* ------------------------------------------------------------------ */
/* Commit file change                                                  */
/* ------------------------------------------------------------------ */

async function commitFile(
  filePath: string,
  content: string,
  branch: string,
  message: string,
  fileSha: string | null
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
  };

  if (fileSha) body.sha = fileSha;

  const res = await fetch(
    `${GITHUB_API}/repos/${repo()}/contents/${filePath}`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to commit: ${res.status} ${text}`);
  }
}

/* ------------------------------------------------------------------ */
/* Create Pull Request                                                 */
/* ------------------------------------------------------------------ */

export async function createFixPR(
  errorId: string,
  fix: FixResult,
  folderCategory: FolderCategory
): Promise<PRResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");

  const timestamp = Date.now();
  const branchName = `auto-fix/error-${errorId.slice(0, 8)}-${timestamp}`;
  const fileName = fix.filePath.split("/").pop() ?? fix.filePath;

  // 1. Get main HEAD SHA
  const mainSha = await getMainSha();

  // 2. Create branch
  await createBranch(branchName, mainSha);

  // 3. Get current file SHA on new branch
  const fileSha = await getFileSha(fix.filePath, branchName);

  // 4. Commit the fix
  await commitFile(
    fix.filePath,
    fix.fixedContent,
    branchName,
    `fix(${folderCategory}): auto-fix error in ${fileName}\n\n${fix.explanation}\n\nError ID: ${errorId}`,
    fileSha
  );

  // 5. Create PR
  const prRes = await fetch(`${GITHUB_API}/repos/${repo()}/pulls`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title: `[Auto-Fix] Fix ${folderCategory} error in ${fileName}`,
      body: `## Auto-Fix Report\n\n**Error ID:** \`${errorId}\`\n**File:** \`${fix.filePath}\`\n**Category:** ${folderCategory}\n\n### What was fixed\n${fix.explanation}\n\n---\n*Generated automatically by Kindar Error Tracker + Claude*`,
      head: branchName,
      base: "main",
      labels: ["auto-fix", folderCategory],
    }),
  });

  if (!prRes.ok) {
    const text = await prRes.text();
    throw new Error(`Failed to create PR: ${prRes.status} ${text}`);
  }

  const prData = await prRes.json();

  // 6. Try to add labels (may fail if labels don't exist yet — non-blocking)
  try {
    await fetch(
      `${GITHUB_API}/repos/${repo()}/issues/${prData.number}/labels`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ labels: ["auto-fix", folderCategory] }),
      }
    );
  } catch {
    // Labels might not exist — that's fine
  }

  return {
    url: prData.html_url,
    branch: branchName,
    number: prData.number,
  };
}
