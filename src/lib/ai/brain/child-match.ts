/* ------------------------------------------------------------------ */
/* child-match.ts — resolve a criança citada num TEXTO livre (PURO)     */
/*                                                                     */
/* Quando o responsável DESCREVE provas por texto/áudio ("Otto tem      */
/* prova…"), não faz sentido perguntar "de qual criança?" se o nome     */
/* está ali. Espelha o `matchChildFromCaption` do WhatsApp pro texto do */
/* assistente — mas CONSERVADOR: só resolve quando EXATAMENTE UMA        */
/* criança do grupo é citada (0 ou ≥2 → null → pergunta, sem chutar).   */
/* ------------------------------------------------------------------ */

import { normalizeForFingerprint } from "./dedupe";
import type { BrainChild } from "./types";

/**
 * Devolve o id da criança citada no texto quando (e só quando) exatamente uma
 * criança do grupo tem o PRIMEIRO nome mencionado como palavra inteira. Nome
 * curto (<2 letras) é ignorado (evita colisão). Puro/determinístico.
 */
export function resolveChildIdFromText(
  text: string | null | undefined,
  children: BrainChild[],
): string | null {
  const t = normalizeForFingerprint(text); // minúsculas, sem acento, espaço colapsado
  if (!t) return null;
  const hits = children.filter((c) => {
    const first = normalizeForFingerprint((c.name || "").split(" ")[0]);
    if (first.length < 2) return false;
    // Palavra inteira (fronteira não-alfanumérica dos dois lados no texto normalizado).
    return new RegExp(`(^|[^a-z0-9])${first}([^a-z0-9]|$)`).test(t);
  });
  return hits.length === 1 ? hits[0].id : null;
}
