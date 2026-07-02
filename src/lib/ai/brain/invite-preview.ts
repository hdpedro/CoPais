/* ------------------------------------------------------------------ */
/* invite-preview.ts — copy PURA da prévia de convite (C3)              */
/*                                                                      */
/* Um convite vira um cartão humano: título, quando (data por extenso   */
/* + horário), onde, descrição composta (tema/traje + RSVP) e a criança */
/* convidada. Reusável: widget + WhatsApp + native.                     */
/* ------------------------------------------------------------------ */

import type { EventInvitePlan } from "./types";

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function weekdayName(iso: string): string {
  return WEEKDAYS[new Date(iso + "T12:00:00").getDay()];
}

/** Mensagem de prévia completa. `withCta:false` = sem a pergunta final. */
export function buildInvitePreviewMessage(
  plan: EventInvitePlan,
  nameOf: (childId: string) => string,
  opts?: { withCta?: boolean },
): string {
  const lines: string[] = [`🎉 ${plan.title}`];

  let when = `📅 ${weekdayName(plan.eventDate)} ${ddmm(plan.eventDate)}`;
  if (plan.endDate) when += ` a ${weekdayName(plan.endDate)} ${ddmm(plan.endDate)}`;
  if (plan.timeStart) {
    when += ` · ${plan.timeStart}${plan.timeEnd ? ` às ${plan.timeEnd}` : ""}`;
  } else {
    when += " · dia inteiro";
  }
  lines.push(when);

  if (plan.location) lines.push(`📍 ${plan.location}`);
  if (plan.description) lines.push(plan.description);
  if (plan.childId) {
    const name = nameOf(plan.childId);
    if (name) lines.push(`👶 ${name}`);
  }

  let msg = lines.join("\n");
  if (opts?.withCta !== false) msg += `\nPosso adicionar ao calendário?`;
  return msg;
}
