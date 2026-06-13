/**
 * CÓPIA NATIVE (parcial) de `src/lib/briefing.ts` do PWA — só o que o painel
 * nativo precisa: `selectHeroKind` (qual herói lidera por forma de família).
 * Puro, sem I/O. Mantenha `selectHeroKind` em sincronia com o PWA.
 *
 * Paridade PWA↔Native (Regra crítica do projeto): a lógica de seleção de herói
 * é a MESMA nas duas plataformas; só a apresentação (DOM vs RN) diverge.
 */

export type BriefingHeroKind = "custody" | "routine" | "setup";

export interface SelectHeroKindInput {
  arrangement: "rotating" | "together" | "single" | "custom";
  hasCustody: boolean;
  hasRoutineSlots: boolean;
}

/**
 * Seleciona qual herói lidera por forma de família — espelha o PWA:
 *   - rotating/custom: guarda quando há guarda hoje; senão rotina (se houver
 *     slots) ou setup.
 *   - together/single: a rotina de leva/busca é o herói (guarda perde sentido);
 *     cai pra guarda só se existir; senão setup.
 *
 * O "Dia em Família" (together/single sem rotina, com evento hoje) NÃO muda o
 * heroKind — no PWA ele renderiza pela seção careRoutine via `familyDayContext`,
 * não pela seleção de herói. O native replica o mesmo: heroKind decide o card,
 * o familyDayContext decide a voz/arco dentro dele.
 */
export function selectHeroKind(input: SelectHeroKindInput): BriefingHeroKind {
  const { arrangement, hasCustody, hasRoutineSlots } = input;
  if (arrangement === "rotating" || arrangement === "custom") {
    if (hasCustody) return "custody";
    return hasRoutineSlots ? "routine" : "setup";
  }
  // together / single — a rotina de leva/busca é o herói (guarda perde sentido)
  if (hasRoutineSlots) return "routine";
  if (hasCustody) return "custody";
  return "setup";
}
