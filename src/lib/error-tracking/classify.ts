/* ------------------------------------------------------------------ */
/* Folder classification — maps file paths to error categories         */
/* ------------------------------------------------------------------ */

export type FolderCategory =
  | "app"
  | "components"
  | "lib"
  | "hooks"
  | "actions"
  | "services"
  | "supabase"
  | "unknown";

const FOLDER_RULES: { prefix: string; category: FolderCategory }[] = [
  { prefix: "src/components/", category: "components" },
  { prefix: "src/hooks/", category: "hooks" },
  { prefix: "src/actions/", category: "actions" },
  { prefix: "src/lib/", category: "lib" },
  { prefix: "src/app/api/", category: "services" },
  { prefix: "src/app/", category: "app" },
  { prefix: "supabase/", category: "supabase" },
];

/**
 * Classify a file path into a folder category.
 * Normalises Windows backslashes and strips leading `./` or absolute prefixes.
 */
export function classifyFolder(filePath: string | undefined | null): FolderCategory {
  if (!filePath) return "unknown";

  // Normalise: backslash → slash, strip leading ./ or absolute prefix up to src/
  let normalised = filePath.replace(/\\/g, "/");
  const srcIndex = normalised.indexOf("src/");
  if (srcIndex > 0) normalised = normalised.slice(srcIndex);
  normalised = normalised.replace(/^\.\//, "");

  for (const rule of FOLDER_RULES) {
    if (normalised.startsWith(rule.prefix)) return rule.category;
  }

  return "unknown";
}

/** Severity colour for Discord embeds */
export function severityColor(severity: string): number {
  switch (severity) {
    case "critical":
      return 0x991b1b; // dark red
    case "error":
      return 0xdc2626; // red
    case "warning":
      return 0xf59e0b; // amber
    default:
      return 0x6b7280; // gray
  }
}
