/* ------------------------------------------------------------------ */
/* memory-lines.ts — açúcar SERVER pros canais montarem as linhas 💭     */
/*                                                                      */
/* As prévias do Brain são pt-BR por construção (build*PreviewMessage); */
/* aqui idem: getServerT("pt"). Um só await em cada rota/handler.       */
/* ------------------------------------------------------------------ */

import { getServerT } from "@/i18n/server";
import type { ImpactFinding } from "./types";
import { renderMemoryLines } from "./family-memory";

/** Linhas 💭 prontas (vazio = sem memória → canais não mudam nada). */
export async function getMemoryLines(
  impacts: ImpactFinding[] | undefined,
  childName: string,
): Promise<string[]> {
  if (!impacts || impacts.length === 0) return [];
  const t = await getServerT("pt");
  return renderMemoryLines(impacts, childName, t);
}
