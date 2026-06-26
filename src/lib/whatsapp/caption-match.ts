/* ------------------------------------------------------------------ */
/* caption-match.ts                                                    */
/* Match a child by first name appearing in an image caption.          */
/*                                                                     */
/* Used to route a WhatsApp prescription photo to the right child when */
/* the group has 2+ children — a receita is clinical data, so we never */
/* silently assume the first child. Pure + dependency-free so it's      */
/* unit-testable in isolation.                                          */
/* ------------------------------------------------------------------ */

export type CaptionChild = {
  id: string;
  full_name: string | null;
  birth_date: string | null;
};

/** Lowercase + strip diacritics so "joão" matches "joao". */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Return the child whose first name appears in the caption, or null if no
 * (or an ambiguous) match. Accent-insensitive; first match wins.
 */
export function matchChildFromCaption(
  caption: string | undefined,
  children: CaptionChild[],
): CaptionChild | null {
  const c = normalize(caption || "");
  if (!c) return null;
  for (const child of children) {
    const first = normalize((child.full_name || "").split(" ")[0] || "");
    if (first && c.includes(first)) return child;
  }
  return null;
}
