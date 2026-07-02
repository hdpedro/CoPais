/* ------------------------------------------------------------------ */
/* materialize-invite-payload.ts — plano de convite → payloads RPC      */
/*                                                                      */
/* PURO/determinístico. ESPELHO DO FORM Novo Evento (paridade por       */
/* construção — actions/events.ts): multi-dia vira UMA LINHA POR DIA    */
/* "Título (i/N)" com end_date preenchido; event_time é TEXT único      */
/* ("15:00" ou "15:00 - 18:00"); sem responsável fixo (assigned_to      */
/* null — convite não diz quem leva, como o form default).              */
/* ------------------------------------------------------------------ */

import { createHash } from "crypto";
import { canonicalize } from "./plan-hash";
import { outboxDedupeKey } from "./dedupe";
import type { EventInvitePlan } from "./types";

function sha256(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface InviteEventPayload {
  child_id: string | null;
  title: string;
  description: string | null;
  event_date: string;
  end_date: string | null;
  event_time: string | null;
  all_day: boolean;
  location: string | null;
  payload_hash: string;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function spanDays(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T12:00:00Z").getTime();
  const b = new Date(bIso + "T12:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function invitePayloadHash(input: {
  childId: string | null;
  title: string;
  eventDate: string;
  eventTime: string | null;
  location: string | null;
}): string {
  return sha256(
    canonicalize({
      childId: input.childId,
      eventDate: input.eventDate,
      eventTime: input.eventTime,
      location: input.location,
      title: input.title,
    }),
  );
}

/** 1 convite → 1..N linhas de events (espelho do form: 1/N por dia). */
export function buildInvitePayloads(plan: EventInvitePlan): InviteEventPayload[] {
  const eventTime = plan.allDay
    ? null
    : plan.timeEnd
      ? `${plan.timeStart} - ${plan.timeEnd}`
      : plan.timeStart;

  const days = plan.endDate ? spanDays(plan.eventDate, plan.endDate) : 1;
  const rows: InviteEventPayload[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(plan.eventDate, i);
    const title = days > 1 ? `${plan.title} (${i + 1}/${days})` : plan.title;
    rows.push({
      child_id: plan.childId,
      title,
      description: plan.description,
      event_date: date,
      end_date: days > 1 ? plan.endDate : null,
      event_time: eventTime,
      all_day: plan.allDay,
      location: plan.location,
      payload_hash: invitePayloadHash({
        childId: plan.childId,
        title,
        eventDate: date,
        eventTime,
        location: plan.location,
      }),
    });
  }
  return rows;
}

/* ---- Coordenação (outbox): "🎉 Aniversário do Théo — sábado 12/07" ---- */

export interface InviteOutboxPayload {
  event_type: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
}

export function buildInviteOutboxPayloads(args: {
  intakeId: string;
  recipientIds: string[];
  title: string;
  eventDate: string;
  childId: string | null;
}): InviteOutboxPayload[] {
  return args.recipientIds.map((recipientId) => ({
    event_type: "collab_notify",
    dedupe_key: outboxDedupeKey(args.intakeId, "collab_notify", recipientId),
    payload: {
      kind: "event_invite",
      intake_id: args.intakeId,
      recipient_id: recipientId,
      title: args.title,
      event_date: args.eventDate,
      child_id: args.childId,
    },
  }));
}
