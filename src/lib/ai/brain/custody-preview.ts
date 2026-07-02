/* ------------------------------------------------------------------ */
/* custody-preview.ts — copy PURA da prévia de guarda & rotina          */
/*                                                                      */
/* Uma linha humana por item, com a GOVERNANÇA explícita: o que vale ao */
/* confirmar (exceção/férias/leva-busca — o coparente é avisado) vs o   */
/* que fica AGUARDANDO (troca = aceite; mudança fixa = OK do outro).    */
/* Pessoa externa em leva/busca declara a verdade ("fica anotado; no    */
/* app o responsável é você"). Reusável: widget + WhatsApp.             */
/* ------------------------------------------------------------------ */

import type { CustodyRoutineItem, CustodyRoutinePlan } from "./types";

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

/** Nomes das crianças do item ("Otto", "Otto e Martim", "as crianças"). */
function childrenLabel(childIds: string[] | null, nameOf: (id: string) => string, allCount: number): string {
  if (childIds === null) return "a família toda";
  const names = childIds.map(nameOf).filter((n) => n !== "");
  if (names.length === 0 || (allCount > 1 && names.length === allCount)) return "as crianças";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

function itemLine(item: CustodyRoutineItem, nameOf: (id: string) => string, allCount: number): string {
  switch (item.kind) {
    case "custody_exception": {
      const who = childrenLabel(item.childIds, nameOf, allCount);
      const when =
        item.startDate === item.endDate
          ? `em ${ddmm(item.startDate)} (${weekdayName(item.startDate)})`
          : `de ${ddmm(item.startDate)} a ${ddmm(item.endDate)}`;
      const reason = item.reason ? ` — ${item.reason}` : "";
      return `• ${who} fica com ${item.responsible.label} ${when}${reason}`;
    }
    case "vacation": {
      const who = childrenLabel(item.childIds, nameOf, allCount);
      return `• Férias: ${who} com ${item.responsible.label}, ${ddmm(item.startDate)} a ${ddmm(item.endDate)}`;
    }
    case "swap_proposal": {
      const dates = item.proposedDate
        ? `${ddmm(item.originalDate)} ⇄ ${ddmm(item.proposedDate)}`
        : ddmm(item.originalDate);
      return `• Troca de dia com ${item.counterpart.label} (${dates}) — aguarda o aceite de ${item.counterpart.label}`;
    }
    case "leg_override": {
      const who = childrenLabel(item.childIds, nameOf, allCount);
      const time = item.time ? ` às ${item.time}` : "";
      const external =
        item.responsible.memberId === null ? " — fica anotado; no app o responsável é você" : "";
      return `• ${weekdayName(item.date)} ${ddmm(item.date)}: quem ${legVerb(item.leg)} ${who} é ${item.responsible.label}${time}${external}`;
    }
    case "slot_change": {
      const time = item.time ? ` às ${item.time}` : "";
      return `• Mudança fixa: toda ${WEEKDAYS[item.weekday]} quem ${legVerb(item.leg)} passa a ser ${item.responsible.label}${time} — aguarda o OK do coparente`;
    }
  }
}

/** Mensagem de prévia completa (widget/WhatsApp anexam os botões). */
export function buildCustodyPreviewMessage(
  plan: CustodyRoutinePlan,
  nameOf: (childId: string) => string,
  totalChildren: number,
): string {
  const lines = plan.items.map((i) => itemLine(i, nameOf, totalChildren));
  return `🗓️ Entendi essas combinações:\n${lines.join("\n")}\nPosso registrar? Quem precisa aprovar será avisado.`;
}
