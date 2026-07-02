/* ------------------------------------------------------------------ */
/* custody-preview.ts — copy PURA da prévia de guarda & rotina          */
/*                                                                      */
/* Uma linha humana por item, com a GOVERNANÇA explícita: o que vale ao */
/* confirmar (exceção/férias/leva-busca — o coparente é avisado) vs o   */
/* que fica AGUARDANDO (troca = aceite; mudança fixa = OK do outro).    */
/* Pessoa externa em leva/busca declara a verdade ("fica anotado; no    */
/* app o responsável é você"). Reusável: widget + WhatsApp.             */
/*                                                                      */
/* R3 (coordenação contextual): as MESMAS linhas viram o corpo da       */
/* notificação do coparente, mas ditas PRO destinatário — "fica com     */
/* você", "quem busca é você" — e sem a cláusula do narrador (aquele    */
/* "no app o responsável é você" fala com quem NARROU, não com quem     */
/* recebe o aviso).                                                     */
/* ------------------------------------------------------------------ */

import type { CustodyRoutineItem, CustodyRoutinePlan, PersonRef } from "./types";

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function weekdayName(iso: string): string {
  return WEEKDAYS[new Date(iso + "T12:00:00").getDay()];
}

function legVerb(leg: "dropoff" | "pickup"): string {
  return leg === "pickup" ? "busca" : "leva";
}

/** Contexto de renderização: prévia (default) ou coordenação pro
 *  destinatário `youId` (R3). */
interface LineCtx {
  youId?: string;
  coordination?: boolean;
}

/** Rótulo da pessoa — "você" quando o item aponta pro destinatário. */
function personLabel(ref: PersonRef, ctx?: LineCtx): string {
  return ctx?.youId && ref.memberId === ctx.youId ? "você" : ref.label;
}

/** Nomes das crianças do item ("Otto", "Otto e Martim", "as crianças"). */
function childrenLabel(childIds: string[] | null, nameOf: (id: string) => string, allCount: number): string {
  if (childIds === null) return "a família toda";
  const names = childIds.map(nameOf).filter((n) => n !== "");
  if (names.length === 0 || (allCount > 1 && names.length === allCount)) return "as crianças";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

function itemLine(
  item: CustodyRoutineItem,
  nameOf: (id: string) => string,
  allCount: number,
  ctx?: LineCtx,
): string {
  switch (item.kind) {
    case "custody_exception": {
      const who = childrenLabel(item.childIds, nameOf, allCount);
      const when =
        item.startDate === item.endDate
          ? `em ${ddmm(item.startDate)} (${weekdayName(item.startDate)})`
          : `de ${ddmm(item.startDate)} a ${ddmm(item.endDate)}`;
      const reason = item.reason ? ` — ${item.reason}` : "";
      return `• ${who} fica com ${personLabel(item.responsible, ctx)} ${when}${reason}`;
    }
    case "vacation": {
      const who = childrenLabel(item.childIds, nameOf, allCount);
      return `• Férias: ${who} com ${personLabel(item.responsible, ctx)}, ${ddmm(item.startDate)} a ${ddmm(item.endDate)}`;
    }
    case "swap_proposal": {
      const dates = item.proposedDate
        ? `${ddmm(item.originalDate)} ⇄ ${ddmm(item.proposedDate)}`
        : ddmm(item.originalDate);
      // "aguarda o aceite de você" não é português — quando a troca é COM o
      // destinatário, a frase inteira muda de dono.
      if (ctx?.youId && item.counterpart.memberId === ctx.youId) {
        return `• Troca de dia com você (${dates}) — você pode aceitar ou recusar no app`;
      }
      return `• Troca de dia com ${item.counterpart.label} (${dates}) — aguarda o aceite de ${item.counterpart.label}`;
    }
    case "leg_override": {
      const who = childrenLabel(item.childIds, nameOf, allCount);
      const time = item.time ? ` às ${item.time}` : "";
      // A cláusula fala com o NARRADOR ("no app o responsável é você") — na
      // coordenação o "você" é outra pessoa, então ela fica de fora (a nota
      // humana já vive no override dentro do app).
      const external =
        item.responsible.memberId === null && !ctx?.coordination
          ? " — fica anotado; no app o responsável é você"
          : "";
      return `• ${weekdayName(item.date)} ${ddmm(item.date)}: quem ${legVerb(item.leg)} ${who} é ${personLabel(item.responsible, ctx)}${time}${external}`;
    }
    case "slot_change": {
      const time = item.time ? ` às ${item.time}` : "";
      return `• Mudança fixa: toda ${WEEKDAYS[item.weekday]} quem ${legVerb(item.leg)} passa a ser ${personLabel(item.responsible, ctx)}${time} — aguarda o OK do coparente`;
    }
  }
}

/** Mensagem de prévia completa. `withCta:false` = sem a pergunta final (o
 *  WhatsApp anexa a própria mensagem de botões; o widget usa o default). */
export function buildCustodyPreviewMessage(
  plan: CustodyRoutinePlan,
  nameOf: (childId: string) => string,
  totalChildren: number,
  opts?: { withCta?: boolean },
): string {
  const lines = plan.items.map((i) => itemLine(i, nameOf, totalChildren));
  let msg = `🗓️ Entendi essas combinações:\n${lines.join("\n")}`;
  if (opts?.withCta !== false) msg += `\nPosso registrar? Quem precisa aprovar será avisado.`;
  return msg;
}

/** R3: corpo da notificação de coordenação pro DESTINATÁRIO — as combinações
 *  em si (com "você" quando apontam pra ele), no máximo `maxLines` linhas
 *  (+ "… e mais N" quando estourar). Retorna "" pra plano vazio (o worker
 *  cai no corpo genérico). */
export function buildCustodyCoordinationBody(
  plan: CustodyRoutinePlan,
  nameOf: (childId: string) => string,
  totalChildren: number,
  recipientId: string,
  maxLines = 3,
): string {
  const ctx: LineCtx = { youId: recipientId, coordination: true };
  const lines = plan.items.map((i) => itemLine(i, nameOf, totalChildren, ctx));
  if (lines.length === 0) return "";
  const shown = lines.slice(0, maxLines);
  const rest = lines.length - shown.length;
  if (rest > 0) shown.push(`… e mais ${rest}`);
  return shown.join("\n");
}
