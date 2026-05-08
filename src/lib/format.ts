/**
 * Strip a leading "CRM"/"CRO" prefix (with optional separator) from a
 * medical registration string so the UI can re-add a uniform "CRM " label
 * without producing "CRM CRM 12345/SP" when the user typed the prefix
 * themselves. Mirrors kindar-native/src/lib/format.ts to keep the same
 * normalization on both clients.
 */
export function formatCRM(crm: string | null | undefined): string {
  if (!crm) return "";
  return crm.replace(/^\s*(CRM|CRO)[\s:]*/i, "").trim();
}
